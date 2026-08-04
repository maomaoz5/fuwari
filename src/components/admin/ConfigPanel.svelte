<script>
import { onMount } from "svelte";

let config = {};
let loading = true;
let saving = false;
let error = "";
let success = "";

// Flattened editable fields
let siteTitle = "";
let siteSubtitle = "";
let siteLang = "";
let profileName = "";
let profileBio = "";
let profileAvatar = "";
let licenseEnable = false;
let licenseName = "";
let licenseUrl = "";
let aiSummaryEnable = false;
let aiSummaryProvider = "openrouter";
let aiSummaryModel = "";
let aiSummaryMaxTokens = 500;
let aiSummaryBaseUrl = "";
let captchaProvider = "turnstile";
let captchaSiteKey = "";

async function loadConfig() {
	loading = true;
	error = "";
	try {
		const res = await fetch("/api/admin/config/");
		if (res.status === 401) {
			error = "认证已过期";
			return;
		}
		if (!res.ok) throw new Error("Failed to load config");
		config = await res.json();
		applyConfig();
	} catch (e) {
		error = `加载配置失败: ${e.message}`;
	} finally {
		loading = false;
	}
}

function applyConfig() {
	const site = config.site || {};
	const profile = config.profile || {};
	const license = config.license || {};
	const aiSummary = config.aiSummary || {};

	siteTitle = site.title || "";
	siteSubtitle = site.subtitle || "";
	siteLang = site.lang || "zh_CN";
	profileName = profile.name || "";
	profileBio = profile.bio || "";
	profileAvatar = profile.avatar || "";
	licenseEnable = license.enable ?? false;
	licenseName = license.name || "";
	licenseUrl = license.url || "";
	aiSummaryEnable = aiSummary.enable ?? false;
	aiSummaryProvider = aiSummary.provider || "openrouter";
	aiSummaryModel = aiSummary.model || "";
	aiSummaryMaxTokens = aiSummary.maxTokens ?? 500;
	aiSummaryBaseUrl = aiSummary.baseUrl || "";

	const captcha = config.captcha || {};
	captchaProvider = captcha.provider || "turnstile";
	captchaSiteKey =
		captchaProvider === "hcaptcha"
			? captcha.hcaptchaSiteKey || ""
			: captcha.turnstileSiteKey || "";
}

async function saveConfig() {
	saving = true;
	error = "";
	success = "";

	const overrides = {
		site: {
			...(config.site || {}),
			title: siteTitle,
			subtitle: siteSubtitle,
			lang: siteLang,
		},
		profile: {
			...(config.profile || {}),
			name: profileName,
			bio: profileBio,
			avatar: profileAvatar,
		},
		license: {
			enable: licenseEnable,
			name: licenseName,
			url: licenseUrl,
		},
		aiSummary: {
			enable: aiSummaryEnable,
			provider: aiSummaryProvider,
			model: aiSummaryModel,
			maxTokens: aiSummaryMaxTokens,
			...(aiSummaryProvider !== "openrouter"
				? { baseUrl: aiSummaryBaseUrl }
				: {}),
		},
		captcha: {
			...(config.captcha || {}),
			provider: captchaProvider,
			...(captchaProvider === "hcaptcha"
				? { hcaptchaSiteKey: captchaSiteKey }
				: { turnstileSiteKey: captchaSiteKey }),
		},
	};

	try {
		const res = await fetch("/api/admin/config/", {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(overrides),
		});
		if (!res.ok) throw new Error("保存失败");
		success = "配置保存成功！";
		setTimeout(() => (success = ""), 3000);
	} catch (e) {
		error = `保存失败: ${e.message}`;
	} finally {
		saving = false;
	}
}

onMount(() => {
	loadConfig();
});
</script>

<div>
  <div class="flex items-center justify-between mb-6">
    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">站点配置</h2>
    <button
      on:click={saveConfig}
      disabled={saving}
      class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition font-medium disabled:opacity-50"
    >
      {saving ? '保存中...' : '保存配置'}
    </button>
  </div>

  {#if error}
    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
      <p class="text-red-600 dark:text-red-400 text-sm">{error}</p>
    </div>
  {/if}

  {#if success}
    <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
      <p class="text-green-600 dark:text-green-400 text-sm">{success}</p>
    </div>
  {/if}

  {#if loading}
    <div class="text-center py-12">
      <p class="text-gray-500 dark:text-gray-400">加载中...</p>
    </div>
  {:else}
    <div class="space-y-6">
      <!-- Site Config -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">站点设置</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">站点标题</label>
            <input
              type="text"
              bind:value={siteTitle}
              class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">副标题</label>
            <input
              type="text"
              bind:value={siteSubtitle}
              class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">语言</label>
            <select
              bind:value={siteLang}
              class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="zh_CN">简体中文</option>
              <option value="zh_TW">繁体中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
              <option value="es">Español</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Profile Config -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">个人资料</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">名称</label>
            <input
              type="text"
              bind:value={profileName}
              class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">简介</label>
            <textarea
              bind:value={profileBio}
              rows="3"
              class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            ></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">头像 URL</label>
            <input
              type="text"
              bind:value={profileAvatar}
              class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <!-- License Config -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">许可证</h3>
        <div class="space-y-4">
          <div class="flex items-center gap-2">
            <input type="checkbox" bind:checked={licenseEnable} id="license-enable" class="w-4 h-4 rounded border-gray-300 dark:border-gray-600" />
            <label for="license-enable" class="text-sm text-gray-700 dark:text-gray-300">启用许可证</label>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">许可证名称</label>
              <input
                type="text"
                bind:value={licenseName}
                class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">许可证 URL</label>
              <input
                type="text"
                bind:value={licenseUrl}
                class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- AI Summary Config -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">AI 总结</h3>
        <div class="space-y-4">
          <div class="flex items-center gap-2">
            <input type="checkbox" bind:checked={aiSummaryEnable} id="ai-enable" class="w-4 h-4 rounded border-gray-300 dark:border-gray-600" />
            <label for="ai-enable" class="text-sm text-gray-700 dark:text-gray-300">启用 AI 总结</label>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">AI 提供商</label>
            <select
              bind:value={aiSummaryProvider}
              class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="openrouter">OpenRouter（默认）</option>
              <option value="openai">OpenAI 兼容</option>
              <option value="custom">自定义</option>
            </select>
          </div>
          {#if aiSummaryProvider !== "openrouter"}
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Base URL{#if aiSummaryProvider === "custom"} <span class="text-red-500">*</span>{/if}
              </label>
              <input
                type="text"
                bind:value={aiSummaryBaseUrl}
                placeholder={aiSummaryProvider === "openai" ? "https://api.openai.com/v1" : "https://your-provider.com/v1"}
                class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {aiSummaryProvider === "openai" ? "留空使用 OpenAI 官方地址" : "必填，如 DeepSeek、智谱等提供商的 API 地址"}
              </p>
            </div>
          {/if}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">模型</label>
              <input
                type="text"
                bind:value={aiSummaryModel}
                class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">最大 Token 数</label>
              <input
                type="number"
                bind:value={aiSummaryMaxTokens}
                class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Captcha Config -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">验证码设置</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">验证码提供商</label>
            <select
              bind:value={captchaProvider}
              class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              <option value="turnstile">Cloudflare Turnstile</option>
              <option value="hcaptcha">hCaptcha</option>
              <option value="none">禁用</option>
            </select>
          </div>
          {#if captchaProvider !== "none"}
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Site Key</label>
              <input
                type="text"
                bind:value={captchaSiteKey}
                placeholder={captchaProvider === "turnstile" ? "输入 Turnstile Site Key" : "输入 hCaptcha Site Key"}
                class="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          {/if}
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Secret Key 请在服务器环境变量中配置：Turnstile 使用 <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded">TURNSTILE_SECRET_KEY</code>，hCaptcha 使用 <code class="bg-gray-100 dark:bg-gray-700 px-1 rounded">HCAPTCHA_SECRET_KEY</code>
          </p>
        </div>
      </div>
    </div>
  {/if}
</div>
