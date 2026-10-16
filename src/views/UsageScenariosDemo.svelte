<script lang="ts">
import { cls } from "$lib/ui/cls";
import Accordion from "$lib/ui/Accordion.svelte";
import AccordionTab from "$lib/ui/AccordionTab.svelte";
import Button from "$lib/ui/Button.svelte";
import Card from "$lib/ui/Card.svelte";
import Checkbox from "$lib/ui/Checkbox.svelte";
import Chip from "$lib/ui/Chip.svelte";
import InputText from "$lib/ui/InputText.svelte";
import Message from "$lib/ui/Message.svelte";

import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";

export type ScenarioId =
  | "auth-sign-in"
  | "auth-sign-up"
  | "join-cemetery"
  | "teach-finish-later"
  | "headstone-confirm"
  | "map-browse"
  | "create-plot-photo"
  | "create-plot-skip-photo"
  | "create-plot-map-point"
  | "plots-search-filter"
  | "plot-detail-edit"
  | "settings-facility-ai"
  | "app-shell-nav"
  | "location-admin";

const TITLES: Record<ScenarioId, string> = {
  "auth-sign-in": "Sign in",
  "auth-sign-up": "Create account",
  "join-cemetery": "Join a cemetery",
  "teach-finish-later": "Teach later",
  "headstone-confirm": "Check the names",
  "map-browse": "Map · browse plots",
  "create-plot-photo": "Create plot · photo",
  "create-plot-skip-photo": "Create plot · no photo",
  "create-plot-map-point": "Create plot · map point",
  "plots-search-filter": "Plots · search & filter",
  "plot-detail-edit": "Plot detail",
  "settings-facility-ai": "Settings",
  "app-shell-nav": "App navigation",
  "location-admin": "Cemetery admin",
};

const route = useRoute();
const scenario = computed<ScenarioId>(() => {
  const s = String(route.query.scenario || "auth-sign-in");
  return (s in TITLES ? s : "auth-sign-in") as ScenarioId;
});
const meta = computed(() => ({ title: TITLES[scenario.value] }));

const kindLabels = {
  one_person: "One person",
  couple: "Couple",
  family: "Family",
  other: "Other / weathered",
} as const;

const email = ref("fieldworker@example.com");
const password = ref("••••••••");
const authDone = ref(false);

const joinQuery = ref("");
const joinCemeteries = [
  { id: "oak", name: "Oakwood Cemetery", region: "County Cork" },
  { id: "river", name: "Riverside Cemetery", region: "Dublin" },
  { id: "hill", name: "Hillside Burial Ground", region: "Galway" },
];
const filteredJoin = computed(() =>
  joinCemeteries.filter((c) =>
    c.name.toLowerCase().includes(joinQuery.value.toLowerCase()),
  ),
);
const joinRequested = ref("");

const finishLaterDone = ref(false);

const stoneKind = ref<keyof typeof kindLabels>("one_person");
const personName = ref("John Smith");
const personBorn = ref("1920");
const personDied = ref("1998");
const confirmDone = ref(false);

const mapPlots = [
  { id: "p1", x: 30, y: 40, section: "A", row: "12", number: "04", status: "Occupied", names: "John Smith" },
  { id: "p2", x: 55, y: 55, section: "B", row: "03", number: "11", status: "Active", names: "Mary & William Jones" },
  { id: "p3", x: 70, y: 30, section: "A", row: "08", number: "02", status: "Reserved", names: "—" },
];
const selectedPlotId = ref<string | null>(null);
const selectedPlot = computed(() => mapPlots.find((p) => p.id === selectedPlotId.value) || null);
const mapDetailOpen = ref(false);

const plotStep = ref(1);
const hasPhoto = ref(false);
const plotSection = ref("A");
const plotRow = ref("12");
const plotNumber = ref("05");
const plotStatus = ref("Occupied");
const plotNotes = ref("Near the west path");
const statusOptions = ["Active", "Occupied", "Reserved", "Unavailable"];
const plotCreated = ref(false);
const contextOpen = ref(false);

const plotsQuery = ref("");
const plotsStatusFilter = ref("All statuses");
const allPlots = [
  { id: "1", section: "A", row: "12", number: "04", status: "Occupied", names: "John Smith" },
  { id: "2", section: "B", row: "03", number: "11", status: "Active", names: "Mary Jones" },
  { id: "3", section: "A", row: "08", number: "02", status: "Reserved", names: "—" },
];
const filteredPlots = computed(() =>
  allPlots.filter((p) => {
    const q = plotsQuery.value.toLowerCase();
    const matchQ =
      !q ||
      `${p.section}-${p.row}-${p.number}`.toLowerCase().includes(q) ||
      p.names.toLowerCase().includes(q);
    const matchS =
      plotsStatusFilter.value === "All statuses" ||
      p.status === plotsStatusFilter.value;
    return matchQ && matchS;
  }),
);

const editingPlot = ref(false);
const addingPerson = ref(false);
const plotSaved = ref(false);
const personSaved = ref(false);

const facilities = [
  { id: "oakwood", name: "Oakwood Cemetery" },
  { id: "riverside", name: "Riverside Cemetery" },
];
const selectedFacility = ref("oakwood");
const teachFromSettings = ref(false);

const shellView = ref<"map" | "plots" | "settings">("map");
const shellViewLabel = computed(() =>
  shellView.value === "map"
    ? "Map view"
    : shellView.value === "plots"
      ? "Plots list"
      : "Settings",
);
const signedOut = ref(false);

const cemeteryName = ref("Oakwood Cemetery");
const isPublic = ref(true);
const locSaved = ref(false);
const inviteEmail = ref("partner@example.com");
const inviteSent = ref(false);
const requestApproved = ref(false);
const memberRemoved = ref(false);

const scenarioComplete = computed(() => {
  switch (scenario.value) {
    case "auth-sign-in":
    case "auth-sign-up":
      return authDone.value;
    case "join-cemetery":
      return !!joinRequested.value;
    case "teach-finish-later":
      return finishLaterDone.value;
    case "headstone-confirm":
      return confirmDone.value;
    case "map-browse":
      return mapDetailOpen.value;
    case "create-plot-photo":
    case "create-plot-skip-photo":
    case "create-plot-map-point":
      return plotCreated.value;
    case "plots-search-filter":
      return plotsQuery.value.length > 0 || plotsStatusFilter.value !== "All statuses";
    case "plot-detail-edit":
      return plotSaved.value || personSaved.value;
    case "settings-facility-ai":
      return teachFromSettings.value || selectedFacility.value === "riverside";
    case "app-shell-nav":
      return signedOut.value || shellView.value !== "map";
    case "location-admin":
      return locSaved.value || inviteSent.value || requestApproved.value;
    default:
      return false;
  }
});

watch(scenario, () => {
  // reset transient flags when switching scenarios via HMR / navigation
  authDone.value = false;
  joinRequested.value = "";
  finishLaterDone.value = false;
  confirmDone.value = false;
  selectedPlotId.value = null;
  mapDetailOpen.value = false;
  plotStep.value = 1;
  plotCreated.value = false;
  contextOpen.value = false;
  editingPlot.value = false;
  addingPerson.value = false;
  plotSaved.value = false;
  personSaved.value = false;
  teachFromSettings.value = false;
  signedOut.value = false;
  locSaved.value = false;
  inviteSent.value = false;
  requestApproved.value = false;
  memberRemoved.value = false;
  shellView.value = "map";
  selectedFacility.value = "oakwood";
});
</script>

<div class="min-h-screen bg-surface-50 p-4 flex items-start justify-center" data-testid="usage-demo" data-scenario={scenario.value}><Card class="w-full max-w-2xl">{#snippet title()}<div class="flex items-center justify-between gap-2"><h2 class="text-xl font-semibold" data-testid="scenario-title">{meta.value.title}</h2><span class="text-xs text-surface-500" data-testid="scenario-id">{scenario.value}</span></div>{/snippet}{#snippet content()}{#if scenario.value === 'auth-sign-in'}<div class="space-y-4" data-testid="sc-auth-sign-in"><p class="text-sm text-surface-600">Sign in to continue field work.</p><InputText class="w-full" bind:value={email.value} placeholder="Email" data-testid="input-email"></InputText><InputText class="w-full" bind:value={password.value} type="password" placeholder="Password" data-testid="input-password"></InputText><Button class="w-full" label="Sign in" data-testid="btn-sign-in" onclick={(event) => {  authDone.value = true }}></Button>{#if authDone.value}<Message severity="success" closable={false} data-testid="auth-success"> Signed in — opening Oakwood Cemetery map… </Message>{/if}</div>{/if}<div class="space-y-4" data-testid="sc-auth-sign-up"><p class="text-sm text-surface-600">Create an account to get started.</p><InputText class="w-full" bind:value={email.value} placeholder="Email" data-testid="input-email"></InputText><InputText class="w-full" bind:value={password.value} type="password" placeholder="Password" data-testid="input-password"></InputText><Button class="w-full" label="Create account" data-testid="btn-sign-up" onclick={(event) => {  authDone.value = true }}></Button>{#if authDone.value}<Message severity="success" closable={false} data-testid="auth-success"> Account created — continue to onboarding… </Message>{/if}</div><div class="space-y-4" data-testid="sc-join-cemetery"><p class="text-sm text-surface-600">Search public cemeteries and request access.</p><InputText class="w-full" bind:value={joinQuery.value} placeholder="Search cemeteries" data-testid="input-join-search"></InputText><div class="space-y-2">{#each filteredJoin.value as c (c.id)}<div class="p-3 border border-surface-200 rounded-lg flex justify-between items-center" data-testid={`join-card-${c.id}`}><div><p class="font-medium">{c.name}</p><p class="text-xs text-surface-500">{c.region}</p></div><Button label="Request to Join" size="small" data-testid={`btn-request-${c.id}`} onclick={(event) => {  joinRequested.value = c.name }}></Button></div>{/each}</div>{#if joinRequested.value}<Message severity="success" closable={false} data-testid="join-success"> Request sent for {joinRequested.value}. An admin will review it. </Message>{/if}</div><div class="space-y-4" data-testid="sc-teach-finish-later"><h3 class="font-semibold">Teach this cemetery</h3><p class="text-sm text-surface-600" data-testid="coverage-message"> Confirm 3 more stones (0 of 3). </p><ul class="text-sm text-surface-600 list-disc pl-5"><li>One person</li><li>Couple</li><li>Family</li></ul><Button class="w-full" label="Take or choose a photo" disabled data-testid="btn-take-photo"></Button><Button class="w-full" label="Finish later" severity="secondary" outlined data-testid="btn-finish-later" onclick={(event) => {  finishLaterDone.value = true }}></Button>{#if finishLaterDone.value}<Message severity="info" closable={false} data-testid="finish-later-done"> Teaching saved for later. Map is ready for field work — online reading still works. </Message>{/if}</div><div class="space-y-4" data-testid="sc-headstone-confirm"><img class="max-h-40 object-contain w-full rounded border" src="/screenshots/plot-detail-narrow.png" alt="Stone" data-testid="stone-preview" /><p class="text-sm font-medium">Check the names</p><div class="grid grid-cols-2 gap-2">{#each kindLabels as label, kind (kind)}<Button label={label} size="small" severity={stoneKind.value === kind ? undefined : 'secondary'} outlined={stoneKind.value !== kind} data-testid={`kind-${kind}`} onclick={(event) => {  stoneKind.value = kind }}></Button>{/each}</div><InputText class="w-full" bind:value={personName.value} placeholder="Full name" data-testid="person-name-0"></InputText><div class="grid grid-cols-2 gap-2"><InputText class="w-full" bind:value={personBorn.value} placeholder="Born" data-testid="person-born-0"></InputText><InputText class="w-full" bind:value={personDied.value} placeholder="Died" data-testid="person-died-0"></InputText></div><Button class="w-full" label="Confirm" data-testid="btn-confirm-stone" onclick={(event) => {  confirmDone.value = true }}></Button>{#if confirmDone.value}<Message severity="success" closable={false} data-testid="confirm-success"> Confirmed — this stone will help teach the cemetery. </Message>{/if}</div><div class="space-y-4" data-testid="sc-map-browse"><div class="relative h-64 rounded-lg border border-surface-200 bg-emerald-50 overflow-hidden" data-testid="map-canvas"><p class="absolute top-2 left-2 text-xs bg-white/90 px-2 py-1 rounded"> Oakwood Cemetery </p>{#each mapPlots as p (p.id)}<button class="absolute w-8 h-8 rounded-full border-2 border-white shadow {cls(selectedPlotId.value === p.id ? 'bg-blue-600' : 'bg-amber-600')}" style={{ left: p.x + '%', top: p.y + '%' }} data-testid={`plot-marker-${p.id}`} onclick={(event) => {  selectedPlotId.value = p.id }}></button>{/each}</div>{#if selectedPlot.value}<div class="p-3 border border-surface-200 rounded-lg space-y-1" data-testid="plot-info-panel"><p class="font-semibold" data-testid="plot-ref">{selectedPlot.value.section}-{selectedPlot.value.row}-{selectedPlot.value.number}</p><p class="text-sm text-surface-600">{selectedPlot.value.status}</p><p class="text-sm" data-testid="plot-names">{selectedPlot.value.names}</p><Button class="mt-2" label="View Details" size="small" data-testid="btn-view-details" onclick={(event) => {  mapDetailOpen.value = true }}></Button></div>{/if}{#if mapDetailOpen.value}<Message severity="success" closable={false} data-testid="map-browse-done"> Opening plot detail… </Message>{/if}</div><div class="space-y-4" data-testid="sc-create-plot-photo"><p class="text-sm font-medium" data-testid="wizard-step">Step {plotStep.value} of 3</p>{#if plotStep.value === 1}<p class="text-sm text-surface-600">Take a high-quality photo of the grave or headstone</p><div class="p-3 rounded-lg bg-green-50 border border-green-200 text-sm" data-testid="gps-stable"> GPS stable · ready to capture </div><Button class="w-full" label="Choose from gallery" data-testid="btn-gallery" onclick={(event) => {  plotStep.value = 2; hasPhoto.value = true }}></Button><Button class="w-full" label="Skip" severity="secondary" outlined data-testid="btn-skip-photo" disabled></Button>{:else if plotStep.value === 2}{#if hasPhoto.value}<img class="max-h-36 object-contain w-full rounded border" src="/screenshots/plot-detail-narrow.png" data-testid="photo-preview" />{/if}<InputText class="w-full" bind:value={plotSection.value} placeholder="Section" data-testid="input-section"></InputText><InputText class="w-full" bind:value={plotRow.value} placeholder="Row" data-testid="input-row"></InputText><InputText class="w-full" bind:value={plotNumber.value} placeholder="Number" data-testid="input-number"></InputText><div class="flex flex-wrap gap-2">{#each statusOptions as s (s)}<Button label={s} size="small" outlined={plotStatus.value !== s} data-testid={`status-${s.toLowerCase()}`} onclick={(event) => {  plotStatus.value = s }}></Button>{/each}</div><Button class="w-full" label="Continue" data-testid="btn-plot-continue" onclick={(event) => {  plotStep.value = 3 }}></Button>{:else}<Message severity="info" closable={false}>Optional: check AI-read names</Message><InputText class="w-full" bind:value={personName.value} data-testid="person-name-0"></InputText><Button class="w-full" label="Create plot" data-testid="btn-create-plot" onclick={(event) => {  plotCreated.value = true }}></Button>{#if plotCreated.value}<Message severity="success" closable={false} data-testid="plot-created"> Plot {plotSection.value}-{plotRow.value}-{plotNumber.value} created on the map. </Message>{/if}{/if}</div><div class="space-y-4" data-testid="sc-create-plot-skip"><p class="text-sm text-surface-600">Create a plot without a photo.</p><Button class="w-full" label="Skip" severity="secondary" outlined data-testid="btn-skip-photo" onclick={(event) => {  plotStep.value = 2 }}></Button>{#if plotStep.value >= 2}<InputText class="w-full" bind:value={plotSection.value} placeholder="Section" data-testid="input-section"></InputText><InputText class="w-full" bind:value={plotRow.value} placeholder="Row" data-testid="input-row"></InputText><InputText class="w-full" bind:value={plotNumber.value} placeholder="Number" data-testid="input-number"></InputText><Button class="w-full" label="Create plot" data-testid="btn-create-plot" onclick={(event) => {  plotCreated.value = true }}></Button>{/if}{#if plotCreated.value}<Message severity="success" closable={false} data-testid="plot-created"> Plot created without a photo. </Message>{/if}</div><div class="space-y-4" data-testid="sc-create-plot-map"><div class="h-48 rounded-lg border bg-emerald-50 relative" data-testid="map-canvas" onContextmenu={(event) => { event.preventDefault(); contextOpen.value = true }}><p class="absolute top-2 left-2 text-xs bg-white/90 px-2 py-1 rounded">Long-press / right-click to add</p>{#if !contextOpen.value}<Button class="absolute bottom-3 left-1/2 -translate-x-1/2" label="Add Plot at This Location" size="small" data-testid="btn-add-at-location" onclick={(event) => {  contextOpen.value = true }}></Button>{/if}</div>{#if contextOpen.value && !plotCreated.value}<p class="text-sm font-medium">Position plot · size Medium</p><div class="h-24 border rounded bg-surface-100 flex items-center justify-center text-sm text-surface-500" data-testid="map-edit"> Drag · rotate · resize </div><InputText class="w-full" bind:value={plotSection.value} data-testid="input-section"></InputText><InputText class="w-full" bind:value={plotRow.value} data-testid="input-row"></InputText><InputText class="w-full" bind:value={plotNumber.value} data-testid="input-number"></InputText><Button class="w-full" label="Create plot" data-testid="btn-create-plot" onclick={(event) => {  plotCreated.value = true }}></Button>{/if}{#if plotCreated.value}<Message severity="success" closable={false} data-testid="plot-created"> Plot placed at the chosen map point. </Message>{/if}</div><div class="space-y-4" data-testid="sc-plots-search"><InputText class="w-full" bind:value={plotsQuery.value} placeholder="Search section, row, number, notes…" data-testid="input-plots-search"></InputText><div class="flex flex-wrap gap-2" data-testid="filter-status-group">{#each ['All statuses', ...statusOptions] as s (s)}<Button label={s} size="small" outlined={plotsStatusFilter.value !== s} data-testid={`filter-status-${s.replace(/\s+/g, '-').toLowerCase()}`} onclick={(event) => {  plotsStatusFilter.value = s }}></Button>{/each}</div><p class="text-sm text-surface-500" data-testid="plots-count">{filteredPlots.value.length} plot{filteredPlots.value.length === 1 ? "" : "s"}</p>{#each filteredPlots.value as p (p.id)}<div class="p-3 border rounded-lg" data-testid={`plot-card-${p.id}`}><div class="flex justify-between"><span class="font-medium">{p.section}-{p.row}-{p.number}</span><Chip label={p.status}></Chip></div><p class="text-sm text-surface-600">{p.names}</p></div>{/each}{#if plotsQuery.value || plotsStatusFilter.value !== 'All statuses'}<Message severity="success" closable={false} data-testid="filter-applied"> Filters applied </Message>{/if}</div><div class="space-y-4" data-testid="sc-plot-detail"><div class="flex justify-between items-center"><h3 class="font-semibold" data-testid="plot-ref">A-12-04</h3><Chip label="Occupied" data-testid="plot-status-chip"></Chip></div>{#if !editingPlot.value}<p class="text-sm text-surface-600">Created 12 Mar 2025 · Synced</p><p class="text-sm" data-testid="plot-notes">Near the west path</p><div class="border rounded p-3 space-y-2" data-testid="person-list"><p class="font-medium">John Smith</p><p class="text-xs text-surface-500">1920 — 1998</p></div><Button class="w-full" label="Edit plot" data-testid="btn-edit-plot" onclick={(event) => {  editingPlot.value = true }}></Button><Button class="w-full" label="Add person" severity="secondary" outlined data-testid="btn-add-person" onclick={(event) => {  addingPerson.value = true }}></Button>{:else if editingPlot.value && !addingPerson.value}<InputText class="w-full" bind:value={plotSection.value} data-testid="input-section"></InputText><InputText class="w-full" bind:value={plotRow.value} data-testid="input-row"></InputText><InputText class="w-full" bind:value={plotNumber.value} data-testid="input-number"></InputText><InputText class="w-full" bind:value={plotNotes.value} data-testid="input-notes"></InputText><Button class="w-full" label="Save plot" data-testid="btn-save-plot" onclick={(event) => {  plotSaved.value = true; editingPlot.value = false }}></Button>{/if}{#if addingPerson.value}<InputText class="w-full" bind:value={personName.value} placeholder="Full name" data-testid="person-name-0"></InputText><InputText class="w-full" bind:value={personBorn.value} placeholder="Born" data-testid="person-born-0"></InputText><InputText class="w-full" bind:value={personDied.value} placeholder="Died" data-testid="person-died-0"></InputText><Button class="w-full" label="Save person" data-testid="btn-save-person" onclick={(event) => {  personSaved.value = true; addingPerson.value = false }}></Button>{/if}{#if plotSaved.value}<Message severity="success" closable={false} data-testid="plot-saved">Plot details saved.</Message>{/if}{#if personSaved.value}<Message severity="success" closable={false} data-testid="person-saved">{personName.value} added to plot. </Message>{/if}</div><div class="space-y-4" data-testid="sc-settings"><Accordion multiple><AccordionTab header="Facility Selection">{#each facilities as f (f.id)}<div class="p-3 border rounded-lg mb-2 flex justify-between cursor-pointer {cls(selectedFacility.value === f.id ? 'border-blue-500 bg-blue-50' : '')}" data-testid={`facility-${f.id}`} onclick={(event) => {  selectedFacility.value = f.id }}><span>{f.name}</span>{#if selectedFacility.value === f.id}<Chip label="Selected" data-testid="facility-selected"></Chip>{/if}</div>{/each}</AccordionTab><AccordionTab header="Headstone reading"><Chip class="mb-2" label="Offline ready" data-testid="ai-status-chip"></Chip><p class="text-sm text-surface-600" data-testid="ai-coverage"> Enough confirmed stones to learn this cemetery offline. </p><Button class="w-full mt-2" label="Teach this cemetery" outlined data-testid="btn-teach-settings" onclick={(event) => {  teachFromSettings.value = true }}></Button></AccordionTab><AccordionTab header="Storage Information"><ul class="text-sm space-y-1" data-testid="storage-breakdown"><li>Database · 12.4 MB</li><li>Images · 84.1 MB</li><li>Map tiles · 210 MB</li><li>Model cache · 480 MB</li></ul></AccordionTab></Accordion>{#if teachFromSettings.value}<Message severity="info" closable={false} data-testid="settings-teach-nav"> Opening teach flow… </Message>{/if}{#if selectedFacility.value === 'riverside'}<Message severity="success" closable={false} data-testid="facility-switched"> Switched to Riverside Cemetery </Message>{/if}</div><div class="space-y-4" data-testid="sc-app-shell"><div class="flex items-center justify-between border-b pb-2" data-testid="toolbar"><h3 class="font-semibold truncate" data-testid="toolbar-location">Oakwood Cemetery</h3><div class="flex gap-2"><Button outlined={shellView.value !== 'map'} size="small" label="Map" data-testid="nav-map" onclick={(event) => {  shellView.value = 'map' }}></Button><Button outlined={shellView.value !== 'plots'} size="small" label="Plots" data-testid="nav-plots" onclick={(event) => {  shellView.value = 'plots' }}></Button><Button outlined={shellView.value !== 'settings'} size="small" label="Settings" data-testid="nav-settings" onclick={(event) => {  shellView.value = 'settings' }}></Button><Button icon="pi pi-sign-out" text rounded data-testid="btn-sign-out" onclick={(event) => {  signedOut.value = true }}></Button></div></div><div class="h-40 border rounded flex items-center justify-center" data-testid="shell-content"><span data-testid="shell-view-label">{shellViewLabel.value}</span></div>{#if signedOut.value}<Message severity="warn" closable={false} data-testid="signed-out"> Signed out — return to sign in. </Message>{/if}</div><div class="space-y-4" data-testid="sc-location-admin"><InputText class="w-full" bind:value={cemeteryName.value} data-testid="input-cemetery-name"></InputText><div class="flex items-center gap-2"><Checkbox bind:value={isPublic.value} binary={true} input-id="pub" data-testid="toggle-public"></Checkbox><label class="text-sm" for="pub">Public cemetery</label></div><Button class="w-full" label="Save changes" data-testid="btn-save-location" onclick={(event) => {  locSaved.value = true }}></Button><div class="border rounded p-3 space-y-2" data-testid="members-list"><p class="text-sm font-medium">Members</p><div class="flex justify-between text-sm"><span>you@fieldwork.app</span><Chip label="Owner"></Chip></div><div class="flex justify-between text-sm items-center"><span>alex@example.com</span><Button label="Remove" size="small" severity="danger" text data-testid="btn-remove-member" onclick={(event) => {  memberRemoved.value = true }}></Button></div></div><div class="border rounded p-3 space-y-2" data-testid="invites"><InputText class="w-full" bind:value={inviteEmail.value} placeholder="Invite email" data-testid="input-invite-email"></InputText><Button class="w-full" label="Send invite" data-testid="btn-send-invite" onclick={(event) => {  inviteSent.value = true }}></Button></div><div class="border rounded p-3 space-y-2" data-testid="join-requests"><p class="text-sm">sam@example.com — “I’d like to help document plots.”</p><Button label="Approve" size="small" data-testid="btn-approve-request" onclick={(event) => {  requestApproved.value = true }}></Button></div>{#if locSaved.value}<Message severity="success" closable={false} data-testid="loc-saved">Cemetery details saved.</Message>{/if}{#if inviteSent.value}<Message severity="success" closable={false} data-testid="invite-sent">Invite sent to {inviteEmail.value}.</Message>{/if}{#if requestApproved.value}<Message severity="success" closable={false} data-testid="request-approved">Join request approved.</Message>{/if}{#if memberRemoved.value}<Message severity="info" closable={false} data-testid="member-removed">Member removed.</Message>{/if}</div><div class="space-y-2" data-testid="sc-unknown"><p class="text-sm text-surface-600">Unknown scenario: {scenario.value}</p><p class="text-xs">Use ?scenario= from the catalog.</p></div>{#if scenarioComplete.value}<p class="text-xs text-center text-surface-400 mt-4" data-testid="scenario-complete"> Scenario complete </p>{/if}{/snippet}</Card></div>
