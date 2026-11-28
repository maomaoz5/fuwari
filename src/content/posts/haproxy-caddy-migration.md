---
title: "一次真实的架构迁移：把博客从 1Panel 搬到 HAProxy + Caddy"
published: 2026-11-12
description: "从 1Panel + OpenResty 迁移到 HAProxy 3.4 LTS + Caddy + 宿主机原生 PostgreSQL，记录完整过程、踩到的十几个坑，以及证书自动化、备份与防护的收尾。"
tags:
  - HAProxy
  - Caddy
  - PostgreSQL
  - 部署
  - 架构迁移
category: "部署运维"
---

## 起因

这套博客跑在 1Panel 上已经小半年：OpenResty 做反代、Docker 版 PostgreSQL 存数据、面板点点鼠标就能装应用、申请证书。舒服是真舒服，问题也是真问题。

转折点是某天我想确认证书什么时候到期，翻了半天才发现：1Panel 里的自动续期记录写着 `auto_renew: 1`，但底下躺着一行报错——`alicloud: zone example.com not found in AliDNS`。域名早就迁到 Cloudflare 了，续期链路断了快两个月。而这张证书带着 `HSTS preload`，一旦过期，访客连"继续访问"的按钮都点不了。

那一刻我意识到：**面板把太多东西藏起来了，藏到出问题时你连它在哪都不知道。**

于是有了这次迁移。

## 目标架构

```
Internet
  └ HAProxy 3.4 LTS（80/443 tcp+udp，TLS 终止 + HTTP/3）
      ├ example.com      → Caddy :8443（HTTPS 回源）→ Node :4321
      ├ docs.example.com → Caddy :8443（静态）
      └ monitor         → :25774

数据层（全部宿主机原生）
  PostgreSQL 18.6 :5432
  Redis           :6379（容器）
  SQLite          （监控应用主库）
```

几条设计原则：

1. **入口唯一**。所有站点共用 HAProxy 一个进程处理 TLS，证书也只有一套。
2. **回源分离**。外部用公网证书，内部用自建 CA，两层解密互不干扰。
3. **数据落地在宿主机**。数据库不再跑在容器里，少一层抽象。
4. **能用 systemd 就不上面板**。配置进 git，改了什么一目了然。

## 为什么不用面板了

不是因为面板不好，而是这套站点的形态变了。

迁移前盘点了一下：5 个站点里 3 个是反代（Go 程序）、2 个纯静态、1 个 Node SSR。**零个 PHP 页面，零个 MySQL 库。** 而面板那套 LNMP 模板里的 PHP 和 MySQL，在我这儿纯粹是占内存的摆设——这台机器总共 1.8 GB 内存。

所以最后选的是「Caddy + 原生 PostgreSQL」，而不是标准的 LCMP / LNMPA。架构要对得上实际负载，不是对上教程。

## 迁移过程：并行实例 + 灰度端口

整个过程守两条规矩：**新增不删旧**、**端口先灰度**。

### 数据库：新旧并行

没有原地升级，而是先装一个原生 PostgreSQL，跑在 5433 上，和线上容器互不干扰：

```bash
# 1. 全量导出（含角色与密码）
docker exec <pg容器> pg_dumpall -U <user> | gzip > all.sql.gz

# 2. 还原到 5433 的临时实例
zcat all.sql.gz | sudo -u postgres psql -p 5433 -d postgres

# 3. 用应用真实密码验证认证与读写
PGPASSWORD=xxx psql -h 127.0.0.1 -p 5433 -U app_user -d app_db -c "select 1"
```

验证通过才动手切换：停容器 → 原生实例改到 5432 → 更新连接串 → 重启应用。

有个省事的设计：应用的连接串写的是 `localhost:5432`，只要原生实例占住 `127.0.0.1:5432`，**应用配置一个字都不用改**。只有容器内的应用要改，因为它得走网桥网关。

### 站点：先灰度再切换

HAProxy 先只监听 `127.0.0.1:9443`，用 `curl --resolve` 打过去逐个核对，确认无误再切 80/443：

```bash
curl -sk --resolve www.example.com:9443:127.0.0.1 https://www.example.com:9443/
```

这一步救了我两次，下面细说。

## 踩到的坑（挑几个有代表性的）

### 坑 1：ACL 全部失效，所有请求都进了默认后端

非标端口下，`Host` 头会带端口（`example.com:9443`），而 `hdr(host)` 是**原样匹配**的：

```haproxy
acl host_main hdr(host) -i example.com    # ❌ 匹配不到 example.com:9443
```

正确做法是先去掉端口再判断：

```haproxy
http-request set-var(txn.host) req.hdr(host),lower,field(1,:)
acl host_main var(txn.host) -m str -i example.com
```

注意 `var()` 必须显式写 `-m str`，否则报 `matching method must be specified first`。

### 坑 2：单证书文件只能服务一个域名

站点原来有两张证书：主证书覆盖 5 个域名，`docs` 子域因为签发时间不同，单独一张。

HAProxy 的 `bind ... crt <file>` 只加载文件里的证书。于是 `docs` 子域握手直接失败——**而主站完全正常，你根本不会立刻发现。**

要么用目录，要么合成一张。我最后重签了一张覆盖全部域名的证书：

```haproxy
bind :443 ssl crt /etc/haproxy/certs/site.pem alpn h2,http/1.1
```

### 坑 3：健康检查里的 `check-sni` 不能用事务变量

```haproxy
server app 127.0.0.1:8443 ssl verify required ca-file /etc/ssl/internal-ca.pem \
       sni var(txn.sni) check check-ssl check-sni var(txn.sni)   # ❌ 全部 DOWN
```

健康检查没有 HTTP 事务上下文，`txn.*` 是空的，SNI 发不出去，后端证书校验必然失败。

```haproxy
check-sni backend.internal    # ✅ 用证书里真实存在的固定 SAN
```

### 坑 4：改了日志格式，打挂了另一个工具

监控 agent 的解析器靠 syslog 前缀里的程序名识别来源，我为了"让日志更干净"把前缀去掉，结果：

- 监控侧：读到行但 0 解析
- 防火墙侧：规则匹配数从 2879 直接掉到 0

**日志是多方共用的接口。** 改格式前先把所有消费者列出来，否则就是修一个坏两个。

### 坑 5：两个安全头被无差别注入到所有站点

反代配置里我图省事，把主站的安全头写在最外层，于是 `Content-Security-Policy`、`Cross-Origin-Resource-Policy` 也套到了另一个完全独立的应用上。那个应用的背景图来自外站，被 CSP 一拦，页面直接变白。

修法是把站点专属的头收敛：

```haproxy
http-response set-header Content-Security-Policy "..." if host_main or host_docs
```

**运维配置里没有"顺手全局"，只有"作用域"。**

### 坑 6：目标准备好了，却改错了副本

站内有两份构建产物：反代读一份（放静态资源），应用进程读另一份（放页面 HTML）。我改了前者，刷新页面毫无变化，**而且不报任何错**。

这种"无错误的无效操作"最耗时间——你会反复怀疑缓存、怀疑 CDN、怀疑浏览器。

## 证书：从断掉到全自动

这是本次迁移最满意的一块。

用 acme.sh + Cloudflare DNS-01 签发，不依赖 80 端口，也不受 CDN 代理影响：

```bash
export CF_Token="***"
acme.sh --issue --dns dns_cf -d example.com -d www.example.com --keylength ec-384
```

续期不用重启进程，走 HAProxy 的运行时接口热替换，长连接不断：

```bash
{ printf 'set ssl cert /etc/haproxy/certs/site.pem <<\n'; cat new.pem; printf '\n\n'; } \
  | socat stdio /run/haproxy/admin.sock
echo 'commit ssl cert /etc/haproxy/certs/site.pem' | socat stdio /run/haproxy/admin.sock
```

实测返回 `Transaction created` → `Success!`。绑定为 acme.sh 的续期回调后，到期前自动换，人不用管。

## 备份：本地 + 加密异地

只备份数据库是不够的，配置和凭据丢了照样起不来。最终打包了这些：

| 内容 | 说明 |
|---|---|
| `pg_dumpall` 全量 | 含角色与密码验证信息 |
| 应用 SQLite | 用 backup API 做一致性快照，不直接 `cp` 正在写的库 |
| 反代与回源配置 | 含自建 CA |
| 证书账户 | 续期凭据 |
| 应用 env | 环境变量 |

每天定时执行，本地留 14 份，同时加密推到对象存储。**上传前必须加密**——归档里躺着数据库口令和 CA 私钥。

有个细节值得说：清理旧备份的命令原本是

```bash
rclone delete --min-age 14d r2:bucket/path/          # ❌
```

但那个目录里还有别的项目的备份。照这样跑两周，历史备份会被静默删光。加上文件名限定才对：

```bash
rclone delete --min-age 14d --include 'mysite-*.enc' r2:bucket/path/
```

**所有带 `--min-age` 的清理，作用域必须收窄到自己的命名空间。**

## 防护：够用就好

原本想上 CrowdSec，结果官方源压根没有当前系统版本的包——第一次以为是网络慢，第二次以为是对端限速，第三次才发现仓库里根本没东西。**同一个问题误判三次，比装不上更值得反省。**

最终方案是两条腿：

- 边界层：fail2ban 四个 jail（SSH 爆破、401/429、**404 洪泛**、累犯）
- 应用层：CrowdSec 判定 + nftables 落地（如果装得上）

404 洪泛这条规则在真实日志上匹配率相当高——爬虫和扫描器比想象中勤快。

## 迁移前后对比

| 指标 | 迁移前 | 迁移后 |
|---|---|---|
| 磁盘占用 | 18 GB（45%） | 14 GB（35%） |
| 内存占用 | 931 MB | 876 MB |
| 证书续期 | 已损坏，靠手动 | 自动，提前一个月 |
| 备份 | 只有单个库的 SQL | 全量 + 加密异地 |
| 配置管理 | 面板里点，无版本 | 三个 git 仓库 |
| 反代层数 | 容器内 OpenResty | 宿主机 HAProxy + Caddy |

内存没降多少，因为加了监控 agent 和防护组件；但**每一层现在都是可解释的**——出问题能定位到具体进程、具体日志、具体配置行。

## 几条复盘

1. **面板不是问题，"不知道"才是问题。** 面板本身很好用，但它让你在故障面前失去坐标。至少要把关键链路（证书、备份、端口归属）自己摸清楚。
2. **灰度端口是廉价的保险。** 全程只在 `127.0.0.1:9443` 上折腾，公网一次都没受影响。那两个"定时炸弹级"的坑都是在这个阶段抓到的。
3. **改配置前先问：谁还在读这个东西？** 日志格式、静态路径、头部字段，往往有多个消费者。
4. **备份要验证，不是"配好就行"。** 真正的验证是回取、解密、比对哈希、解开归档——我做完这一套才敢说备份是有效的。
5. **归因错误要认。** 这次在"下载慢"上连续误判三次，每次都基于不完整的观测就下了结论。先测再判，别猜。

## 最后

迁移结束那天，最直观的感受不是"性能提升了"或者"内存省了多少"，而是**知道东西都在哪儿了**。

面板把复杂度藏起来，这是它的价值；但当复杂度藏到你自己都说不清的时候，它就变成了负债。

自建不等于更专业，只是把"信任"从别人手里拿回了自己手上——顺带，也把责任拿回来了。

## 补记（2026-11-28）

迁移半年后回头看，有两处需要补上，否则这篇文章会误导后来的人。

**数据库已升到 PostgreSQL 19.0**，仍是宿主机原生、仍占 5432，文中写的 18.6 是迁移当时的版本。

升级时撞到一个 19 的变化：`SHOW lc_collate` 在 19 上会直接报 `无法识别的配置参数`。要看排序规则得换写法：

```sql
select datname, datcollate, datctype from pg_database;
```

这个变化不在官方 19 的兼容性清单里，属于"文档没写、实际变了"的那类。**任何依赖 `SHOW lc_collate` 的备份脚本、监控探针、ORM 初始化代码，在 19 上都会失败**——如果哪天你的运维脚本突然在排序规则这行报错，先想想是不是升级了数据库。

另外，本文里的域名统一用 `example.com` 占位，避免把真实站点信息留在公开文章里。
