<script lang="ts">
import Button from "$lib/ui/Button.svelte";
import Card from "$lib/ui/Card.svelte";
import Dropdown from "$lib/ui/Select.svelte";
import InputText from "$lib/ui/InputText.svelte";

import { ref, computed, onMounted } from "vue";
import { createSupabaseClient } from "@/lib/supabase/client";
import { useToast } from "primevue/usetoast";

const props = $props<{
  locationId: string;
}>();

const toast = useToast();
const inviteEmail = ref("");
const inviteRole = ref("member");
const isSending = ref(false);
const invites = ref<any[]>([]);

const roleOptions = [
  { label: "Member", value: "member" },
  { label: "Admin", value: "admin" },
];

const pendingInvites = computed(() =>
  invites.value.filter((inv) => inv.status === "pending"),
);

const loadInvites = async () => {
  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("location_invites")
      .select("*")
      .eq("location_id", props.locationId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    invites.value = data || [];
  } catch (error) {
    console.error("Error loading invites:", error);
  }
};

const sendInvite = async () => {
  if (!inviteEmail.value) return;

  isSending.value = true;
  try {
    const supabase = createSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const token = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    const { error } = await supabase.from("location_invites").insert({
      id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      location_id: props.locationId,
      invited_by: user.id,
      email: inviteEmail.value,
      role: inviteRole.value,
      token,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
    });

    if (error) throw error;

    toast.add({
      severity: "success",
      summary: "Success",
      detail: "Invite sent",
    });

    inviteEmail.value = "";
    await loadInvites();
  } catch (error) {
    console.error("Error sending invite:", error);
    toast.add({
      severity: "error",
      summary: "Error",
      detail: "Failed to send invite",
    });
  } finally {
    isSending.value = false;
  }
};

const cancelInvite = async (inviteId: string) => {
  try {
    const supabase = createSupabaseClient();
    const { error } = await supabase
      .from("location_invites")
      .update({ status: "cancelled" })
      .eq("id", inviteId);

    if (error) throw error;

    await loadInvites();
  } catch (error) {
    console.error("Error cancelling invite:", error);
  }
};

const copyInviteLink = (token: string) => {
  const link = `${window.location.origin}/auth/callback?invite=${token}`;
  navigator.clipboard.writeText(link);
  toast.add({
    severity: "info",
    summary: "Copied",
    detail: "Invite link copied to clipboard",
  });
};

onMounted(() => {
  loadInvites();
});
</script>

<Card>{#snippet title()}Invites{/snippet}{#snippet content()}<div class="space-y-4"><div class="flex gap-2"><InputText class="flex-1" bind:value={inviteEmail.value} placeholder="Email address"></InputText><Dropdown bind:value={inviteRole.value} options={roleOptions} optionLabel="label" optionValue="value" placeholder="Role"></Dropdown><Button disabled={!inviteEmail.value || isSending.value} loading={isSending.value} onclick={sendInvite}> Send Invite </Button></div>{#if pendingInvites.value.length === 0}<div class="text-center py-4 text-surface-500"> No pending invites </div>{:else}<div class="space-y-2">{#each pendingInvites.value as invite (invite.id)}<div class="p-3 border border-surface-200 rounded-lg flex items-center justify-between"><div><p class="font-medium">{invite.email}</p><p class="text-sm text-surface-600">Role: {invite.role}</p></div><div class="flex gap-2"><Button icon="pi pi-copy" text rounded title="Copy invite link" aria-label="Copy invite link" onclick={(event) => {  copyInviteLink(invite.token) }}></Button><Button icon="pi pi-times" text rounded severity="danger" onclick={(event) => {  cancelInvite(invite.id) }}></Button></div></div>{/each}</div>{/if}</div>{/snippet}</Card>
