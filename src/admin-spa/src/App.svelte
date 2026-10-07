<script lang="ts">
import { onMount } from "svelte";
import { api } from "./api";
import Dashboard from "./pages/Dashboard.svelte";
import Login from "./pages/Login.svelte";
import ResetPassword from "./pages/ResetPassword.svelte";
import { navigate, parseHash } from "./router";

let hash = $state(location.hash || "#/login");
let authed = $state<boolean | null>(null);

onMount(() => {
	const onChange = () => (hash = location.hash || "#/login");
	window.addEventListener("hashchange", onChange);
	return () => window.removeEventListener("hashchange", onChange);
});

onMount(async () => {
	try {
		await api("/api/admin/me");
		authed = true;
	} catch {
		authed = false;
	}
});

const route = $derived(parseHash(hash));
const isPublic = $derived(
	route.name === "login" || route.name === "reset-password",
);

$effect(() => {
	if (authed === false && !isPublic) navigate("#/login");
	if (authed === true && route.name === "login") navigate("#/posts");
});
</script>

{#if route.name === "reset-password"}
	<ResetPassword query={route.query} />
{:else if route.name === "login"}
	<Login onLogin={() => (authed = true)} />
{:else if authed}
	<Dashboard {route} />
{:else}
	<p class="p-12 text-center text-gray-500">加载中...</p>
{/if}
