<template>
  <div
    class="min-h-screen bg-surface-50 p-4 flex items-start justify-center"
    data-testid="usage-demo"
    :data-scenario="scenario"
  >
    <Card class="w-full max-w-2xl">
      <template #title>
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-xl font-semibold" data-testid="scenario-title">
            {{ meta.title }}
          </h2>
          <span class="text-xs text-surface-500" data-testid="scenario-id">{{
            scenario
          }}</span>
        </div>
      </template>
      <template #content>
        <!-- AUTH: sign-in -->
        <div v-if="scenario === 'auth-sign-in'" class="space-y-4" data-testid="sc-auth-sign-in">
          <p class="text-sm text-surface-600">Sign in to continue field work.</p>
          <InputText
            v-model="email"
            class="w-full"
            placeholder="Email"
            data-testid="input-email"
          />
          <InputText
            v-model="password"
            type="password"
            class="w-full"
            placeholder="Password"
            data-testid="input-password"
          />
          <Button
            label="Sign in"
            class="w-full"
            data-testid="btn-sign-in"
            @click="authDone = true"
          />
          <Message v-if="authDone" severity="success" :closable="false" data-testid="auth-success">
            Signed in — opening Oakwood Cemetery map…
          </Message>
        </div>

        <!-- AUTH: sign-up -->
        <div v-else-if="scenario === 'auth-sign-up'" class="space-y-4" data-testid="sc-auth-sign-up">
          <p class="text-sm text-surface-600">Create an account to get started.</p>
          <InputText
            v-model="email"
            class="w-full"
            placeholder="Email"
            data-testid="input-email"
          />
          <InputText
            v-model="password"
            type="password"
            class="w-full"
            placeholder="Password"
            data-testid="input-password"
          />
          <Button
            label="Create account"
            class="w-full"
            data-testid="btn-sign-up"
            @click="authDone = true"
          />
          <Message v-if="authDone" severity="success" :closable="false" data-testid="auth-success">
            Account created — continue to onboarding…
          </Message>
        </div>

        <!-- JOIN cemetery -->
        <div v-else-if="scenario === 'join-cemetery'" class="space-y-4" data-testid="sc-join-cemetery">
          <p class="text-sm text-surface-600">Search public cemeteries and request access.</p>
          <InputText
            v-model="joinQuery"
            class="w-full"
            placeholder="Search cemeteries"
            data-testid="input-join-search"
          />
          <div class="space-y-2">
            <div
              v-for="c in filteredJoin"
              :key="c.id"
              class="p-3 border border-surface-200 rounded-lg flex justify-between items-center"
              :data-testid="`join-card-${c.id}`"
            >
              <div>
                <p class="font-medium">{{ c.name }}</p>
                <p class="text-xs text-surface-500">{{ c.region }}</p>
              </div>
              <Button
                label="Request to Join"
                size="small"
                :data-testid="`btn-request-${c.id}`"
                @click="joinRequested = c.name"
              />
            </div>
          </div>
          <Message
            v-if="joinRequested"
            severity="success"
            :closable="false"
            data-testid="join-success"
          >
            Request sent for {{ joinRequested }}. An admin will review it.
          </Message>
        </div>

        <!-- TEACH finish later -->
        <div v-else-if="scenario === 'teach-finish-later'" class="space-y-4" data-testid="sc-teach-finish-later">
          <h3 class="font-semibold">Teach this cemetery</h3>
          <p class="text-sm text-surface-600" data-testid="coverage-message">
            Confirm 3 more stones (0 of 3).
          </p>
          <ul class="text-sm text-surface-600 list-disc pl-5">
            <li>One person</li>
            <li>Couple</li>
            <li>Family</li>
          </ul>
          <Button label="Take or choose a photo" class="w-full" disabled data-testid="btn-take-photo" />
          <Button
            label="Finish later"
            severity="secondary"
            outlined
            class="w-full"
            data-testid="btn-finish-later"
            @click="finishLaterDone = true"
          />
          <Message
            v-if="finishLaterDone"
            severity="info"
            :closable="false"
            data-testid="finish-later-done"
          >
            Teaching saved for later. Map is ready for field work — online reading still works.
          </Message>
        </div>

        <!-- HEADSTONE confirm -->
        <div v-else-if="scenario === 'headstone-confirm'" class="space-y-4" data-testid="sc-headstone-confirm">
          <img
            src="/screenshots/plot-detail-narrow.png"
            alt="Stone"
            class="max-h-40 object-contain w-full rounded border"
            data-testid="stone-preview"
          />
          <p class="text-sm font-medium">Check the names</p>
          <div class="grid grid-cols-2 gap-2">
            <Button
              v-for="(label, kind) in kindLabels"
              :key="kind"
              :label="label"
              size="small"
              :severity="stoneKind === kind ? undefined : 'secondary'"
              :outlined="stoneKind !== kind"
              :data-testid="`kind-${kind}`"
              @click="stoneKind = kind"
            />
          </div>
          <InputText
            v-model="personName"
            class="w-full"
            placeholder="Full name"
            data-testid="person-name-0"
          />
          <div class="grid grid-cols-2 gap-2">
            <InputText v-model="personBorn" class="w-full" placeholder="Born" data-testid="person-born-0" />
            <InputText v-model="personDied" class="w-full" placeholder="Died" data-testid="person-died-0" />
          </div>
          <Button label="Confirm" class="w-full" data-testid="btn-confirm-stone" @click="confirmDone = true" />
          <Message v-if="confirmDone" severity="success" :closable="false" data-testid="confirm-success">
            Confirmed — this stone will help teach the cemetery.
          </Message>
        </div>

        <!-- MAP browse -->
        <div v-else-if="scenario === 'map-browse'" class="space-y-4" data-testid="sc-map-browse">
          <div
            class="relative h-64 rounded-lg border border-surface-200 bg-emerald-50 overflow-hidden"
            data-testid="map-canvas"
          >
            <p class="absolute top-2 left-2 text-xs bg-white/90 px-2 py-1 rounded">
              Oakwood Cemetery
            </p>
            <button
              v-for="p in mapPlots"
              :key="p.id"
              class="absolute w-8 h-8 rounded-full border-2 border-white shadow"
              :class="selectedPlotId === p.id ? 'bg-blue-600' : 'bg-amber-600'"
              :style="{ left: p.x + '%', top: p.y + '%' }"
              :data-testid="`plot-marker-${p.id}`"
              @click="selectedPlotId = p.id"
            />
          </div>
          <div
            v-if="selectedPlot"
            class="p-3 border border-surface-200 rounded-lg space-y-1"
            data-testid="plot-info-panel"
          >
            <p class="font-semibold" data-testid="plot-ref">
              {{ selectedPlot.section }}-{{ selectedPlot.row }}-{{ selectedPlot.number }}
            </p>
            <p class="text-sm text-surface-600">{{ selectedPlot.status }}</p>
            <p class="text-sm" data-testid="plot-names">{{ selectedPlot.names }}</p>
            <Button
              label="View Details"
              size="small"
              class="mt-2"
              data-testid="btn-view-details"
              @click="mapDetailOpen = true"
            />
          </div>
          <Message v-if="mapDetailOpen" severity="success" :closable="false" data-testid="map-browse-done">
            Opening plot detail…
          </Message>
        </div>

        <!-- CREATE plot with photo -->
        <div v-else-if="scenario === 'create-plot-photo'" class="space-y-4" data-testid="sc-create-plot-photo">
          <p class="text-sm font-medium" data-testid="wizard-step">Step {{ plotStep }} of 3</p>
          <template v-if="plotStep === 1">
            <p class="text-sm text-surface-600">Take a high-quality photo of the grave or headstone</p>
            <div class="p-3 rounded-lg bg-green-50 border border-green-200 text-sm" data-testid="gps-stable">
              GPS stable · ready to capture
            </div>
            <Button label="Choose from gallery" class="w-full" data-testid="btn-gallery" @click="plotStep = 2; hasPhoto = true" />
            <Button label="Skip" severity="secondary" outlined class="w-full" data-testid="btn-skip-photo" disabled />
          </template>
          <template v-else-if="plotStep === 2">
            <img
              v-if="hasPhoto"
              src="/screenshots/plot-detail-narrow.png"
              class="max-h-36 object-contain w-full rounded border"
              data-testid="photo-preview"
            />
            <InputText v-model="plotSection" class="w-full" placeholder="Section" data-testid="input-section" />
            <InputText v-model="plotRow" class="w-full" placeholder="Row" data-testid="input-row" />
            <InputText v-model="plotNumber" class="w-full" placeholder="Number" data-testid="input-number" />
            <div class="flex flex-wrap gap-2">
              <Button
                v-for="s in statusOptions"
                :key="s"
                :label="s"
                size="small"
                :outlined="plotStatus !== s"
                :data-testid="`status-${s.toLowerCase()}`"
                @click="plotStatus = s"
              />
            </div>
            <Button label="Continue" class="w-full" data-testid="btn-plot-continue" @click="plotStep = 3" />
          </template>
          <template v-else>
            <Message severity="info" :closable="false">Optional: check AI-read names</Message>
            <InputText v-model="personName" class="w-full" data-testid="person-name-0" />
            <Button label="Create plot" class="w-full" data-testid="btn-create-plot" @click="plotCreated = true" />
            <Message v-if="plotCreated" severity="success" :closable="false" data-testid="plot-created">
              Plot {{ plotSection }}-{{ plotRow }}-{{ plotNumber }} created on the map.
            </Message>
          </template>
        </div>

        <!-- CREATE plot skip photo -->
        <div v-else-if="scenario === 'create-plot-skip-photo'" class="space-y-4" data-testid="sc-create-plot-skip">
          <p class="text-sm text-surface-600">Create a plot without a photo.</p>
          <Button label="Skip" severity="secondary" outlined class="w-full" data-testid="btn-skip-photo" @click="plotStep = 2" />
          <template v-if="plotStep >= 2">
            <InputText v-model="plotSection" class="w-full" placeholder="Section" data-testid="input-section" />
            <InputText v-model="plotRow" class="w-full" placeholder="Row" data-testid="input-row" />
            <InputText v-model="plotNumber" class="w-full" placeholder="Number" data-testid="input-number" />
            <Button label="Create plot" class="w-full" data-testid="btn-create-plot" @click="plotCreated = true" />
          </template>
          <Message v-if="plotCreated" severity="success" :closable="false" data-testid="plot-created">
            Plot created without a photo.
          </Message>
        </div>

        <!-- CREATE plot from map context -->
        <div v-else-if="scenario === 'create-plot-map-point'" class="space-y-4" data-testid="sc-create-plot-map">
          <div
            class="h-48 rounded-lg border bg-emerald-50 relative"
            data-testid="map-canvas"
            @contextmenu.prevent="contextOpen = true"
          >
            <p class="absolute top-2 left-2 text-xs bg-white/90 px-2 py-1 rounded">Long-press / right-click to add</p>
            <Button
              v-if="!contextOpen"
              label="Add Plot at This Location"
              class="absolute bottom-3 left-1/2 -translate-x-1/2"
              size="small"
              data-testid="btn-add-at-location"
              @click="contextOpen = true"
            />
          </div>
          <template v-if="contextOpen && !plotCreated">
            <p class="text-sm font-medium">Position plot · size Medium</p>
            <div class="h-24 border rounded bg-surface-100 flex items-center justify-center text-sm text-surface-500" data-testid="map-edit">
              Drag · rotate · resize
            </div>
            <InputText v-model="plotSection" class="w-full" data-testid="input-section" />
            <InputText v-model="plotRow" class="w-full" data-testid="input-row" />
            <InputText v-model="plotNumber" class="w-full" data-testid="input-number" />
            <Button label="Create plot" class="w-full" data-testid="btn-create-plot" @click="plotCreated = true" />
          </template>
          <Message v-if="plotCreated" severity="success" :closable="false" data-testid="plot-created">
            Plot placed at the chosen map point.
          </Message>
        </div>

        <!-- PLOTS list search filter -->
        <div v-else-if="scenario === 'plots-search-filter'" class="space-y-4" data-testid="sc-plots-search">
          <InputText
            v-model="plotsQuery"
            class="w-full"
            placeholder="Search section, row, number, notes…"
            data-testid="input-plots-search"
          />
            <div class="flex flex-wrap gap-2" data-testid="filter-status-group">
              <Button
                v-for="s in ['All statuses', ...statusOptions]"
                :key="s"
                :label="s"
                size="small"
                :outlined="plotsStatusFilter !== s"
                :data-testid="`filter-status-${s.replace(/\s+/g, '-').toLowerCase()}`"
                @click="plotsStatusFilter = s"
              />
            </div>
          <p class="text-sm text-surface-500" data-testid="plots-count">
            {{ filteredPlots.length }} plot{{ filteredPlots.length === 1 ? "" : "s" }}
          </p>
          <div
            v-for="p in filteredPlots"
            :key="p.id"
            class="p-3 border rounded-lg"
            :data-testid="`plot-card-${p.id}`"
          >
            <div class="flex justify-between">
              <span class="font-medium">{{ p.section }}-{{ p.row }}-{{ p.number }}</span>
              <Chip :label="p.status" />
            </div>
            <p class="text-sm text-surface-600">{{ p.names }}</p>
          </div>
          <Message
            v-if="plotsQuery || plotsStatusFilter !== 'All statuses'"
            severity="success"
            :closable="false"
            data-testid="filter-applied"
          >
            Filters applied
          </Message>
        </div>

        <!-- PLOT detail edit -->
        <div v-else-if="scenario === 'plot-detail-edit'" class="space-y-4" data-testid="sc-plot-detail">
          <div class="flex justify-between items-center">
            <h3 class="font-semibold" data-testid="plot-ref">A-12-04</h3>
            <Chip label="Occupied" data-testid="plot-status-chip" />
          </div>
          <template v-if="!editingPlot">
            <p class="text-sm text-surface-600">Created 12 Mar 2025 · Synced</p>
            <p class="text-sm" data-testid="plot-notes">Near the west path</p>
            <div class="border rounded p-3 space-y-2" data-testid="person-list">
              <p class="font-medium">John Smith</p>
              <p class="text-xs text-surface-500">1920 — 1998</p>
            </div>
            <Button label="Edit plot" class="w-full" data-testid="btn-edit-plot" @click="editingPlot = true" />
            <Button label="Add person" severity="secondary" outlined class="w-full" data-testid="btn-add-person" @click="addingPerson = true" />
          </template>
          <template v-else-if="editingPlot && !addingPerson">
            <InputText v-model="plotSection" class="w-full" data-testid="input-section" />
            <InputText v-model="plotRow" class="w-full" data-testid="input-row" />
            <InputText v-model="plotNumber" class="w-full" data-testid="input-number" />
            <InputText v-model="plotNotes" class="w-full" data-testid="input-notes" />
            <Button label="Save plot" class="w-full" data-testid="btn-save-plot" @click="plotSaved = true; editingPlot = false" />
          </template>
          <template v-if="addingPerson">
            <InputText v-model="personName" class="w-full" placeholder="Full name" data-testid="person-name-0" />
            <InputText v-model="personBorn" class="w-full" placeholder="Born" data-testid="person-born-0" />
            <InputText v-model="personDied" class="w-full" placeholder="Died" data-testid="person-died-0" />
            <Button label="Save person" class="w-full" data-testid="btn-save-person" @click="personSaved = true; addingPerson = false" />
          </template>
          <Message v-if="plotSaved" severity="success" :closable="false" data-testid="plot-saved">Plot details saved.</Message>
          <Message v-if="personSaved" severity="success" :closable="false" data-testid="person-saved">
            {{ personName }} added to plot.
          </Message>
        </div>

        <!-- SETTINGS -->
        <div v-else-if="scenario === 'settings-facility-ai'" class="space-y-4" data-testid="sc-settings">
          <Accordion multiple>
            <AccordionTab header="Facility Selection">
              <div
                v-for="f in facilities"
                :key="f.id"
                class="p-3 border rounded-lg mb-2 flex justify-between cursor-pointer"
                :class="selectedFacility === f.id ? 'border-blue-500 bg-blue-50' : ''"
                :data-testid="`facility-${f.id}`"
                @click="selectedFacility = f.id"
              >
                <span>{{ f.name }}</span>
                <Chip v-if="selectedFacility === f.id" label="Selected" data-testid="facility-selected" />
              </div>
            </AccordionTab>
            <AccordionTab header="Headstone reading">
              <Chip label="Offline ready" class="mb-2" data-testid="ai-status-chip" />
              <p class="text-sm text-surface-600" data-testid="ai-coverage">
                Enough confirmed stones to learn this cemetery offline.
              </p>
              <Button
                label="Teach this cemetery"
                class="w-full mt-2"
                outlined
                data-testid="btn-teach-settings"
                @click="teachFromSettings = true"
              />
            </AccordionTab>
            <AccordionTab header="Storage Information">
              <ul class="text-sm space-y-1" data-testid="storage-breakdown">
                <li>Database · 12.4 MB</li>
                <li>Images · 84.1 MB</li>
                <li>Map tiles · 210 MB</li>
                <li>Model cache · 480 MB</li>
              </ul>
            </AccordionTab>
          </Accordion>
          <Message v-if="teachFromSettings" severity="info" :closable="false" data-testid="settings-teach-nav">
            Opening teach flow…
          </Message>
          <Message
            v-if="selectedFacility === 'riverside'"
            severity="success"
            :closable="false"
            data-testid="facility-switched"
          >
            Switched to Riverside Cemetery
          </Message>
        </div>

        <!-- APP SHELL nav -->
        <div v-else-if="scenario === 'app-shell-nav'" class="space-y-4" data-testid="sc-app-shell">
          <div class="flex items-center justify-between border-b pb-2" data-testid="toolbar">
            <h3 class="font-semibold truncate" data-testid="toolbar-location">Oakwood Cemetery</h3>
            <div class="flex gap-2">
              <Button
                :outlined="shellView !== 'map'"
                size="small"
                label="Map"
                data-testid="nav-map"
                @click="shellView = 'map'"
              />
              <Button
                :outlined="shellView !== 'plots'"
                size="small"
                label="Plots"
                data-testid="nav-plots"
                @click="shellView = 'plots'"
              />
              <Button
                :outlined="shellView !== 'settings'"
                size="small"
                label="Settings"
                data-testid="nav-settings"
                @click="shellView = 'settings'"
              />
              <Button
                icon="pi pi-sign-out"
                text
                rounded
                data-testid="btn-sign-out"
                @click="signedOut = true"
              />
            </div>
          </div>
          <div class="h-40 border rounded flex items-center justify-center" data-testid="shell-content">
            <span data-testid="shell-view-label">{{ shellViewLabel }}</span>
          </div>
          <Message v-if="signedOut" severity="warn" :closable="false" data-testid="signed-out">
            Signed out — return to sign in.
          </Message>
        </div>

        <!-- LOCATION admin -->
        <div v-else-if="scenario === 'location-admin'" class="space-y-4" data-testid="sc-location-admin">
          <InputText v-model="cemeteryName" class="w-full" data-testid="input-cemetery-name" />
          <div class="flex items-center gap-2">
            <Checkbox v-model="isPublic" :binary="true" input-id="pub" data-testid="toggle-public" />
            <label for="pub" class="text-sm">Public cemetery</label>
          </div>
          <Button label="Save changes" class="w-full" data-testid="btn-save-location" @click="locSaved = true" />
          <div class="border rounded p-3 space-y-2" data-testid="members-list">
            <p class="text-sm font-medium">Members</p>
            <div class="flex justify-between text-sm">
              <span>you@fieldwork.app</span>
              <Chip label="Owner" />
            </div>
            <div class="flex justify-between text-sm items-center">
              <span>alex@example.com</span>
              <Button label="Remove" size="small" severity="danger" text data-testid="btn-remove-member" @click="memberRemoved = true" />
            </div>
          </div>
          <div class="border rounded p-3 space-y-2" data-testid="invites">
            <InputText v-model="inviteEmail" class="w-full" placeholder="Invite email" data-testid="input-invite-email" />
            <Button label="Send invite" class="w-full" data-testid="btn-send-invite" @click="inviteSent = true" />
          </div>
          <div class="border rounded p-3 space-y-2" data-testid="join-requests">
            <p class="text-sm">sam@example.com — “I’d like to help document plots.”</p>
            <Button label="Approve" size="small" data-testid="btn-approve-request" @click="requestApproved = true" />
          </div>
          <Message v-if="locSaved" severity="success" :closable="false" data-testid="loc-saved">Cemetery details saved.</Message>
          <Message v-if="inviteSent" severity="success" :closable="false" data-testid="invite-sent">Invite sent to {{ inviteEmail }}.</Message>
          <Message v-if="requestApproved" severity="success" :closable="false" data-testid="request-approved">Join request approved.</Message>
          <Message v-if="memberRemoved" severity="info" :closable="false" data-testid="member-removed">Member removed.</Message>
        </div>

        <!-- FALLBACK / unknown -->
        <div v-else class="space-y-2" data-testid="sc-unknown">
          <p class="text-sm text-surface-600">Unknown scenario: {{ scenario }}</p>
          <p class="text-xs">Use ?scenario= from the catalog.</p>
        </div>

        <p
          v-if="scenarioComplete"
          class="text-xs text-center text-surface-400 mt-4"
          data-testid="scenario-complete"
        >
          Scenario complete
        </p>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import Card from "primevue/card";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Chip from "primevue/chip";
import Checkbox from "primevue/checkbox";
import Accordion from "primevue/accordion";
import AccordionTab from "primevue/accordiontab";

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
