import { createRouter, createWebHistory } from 'vue-router'
import MapView from '../views/MapView.vue'
import PlotsView from '../views/PlotsView.vue'
import PlotDetail from '../views/PlotDetail.vue'
import LocationsView from '../views/Locations.vue'
import Settings from '../views/Settings.vue'
import SyncView from '../views/SyncView.vue'

const routes = [
  {
    path: '/',
    name: 'Map',
    component: MapView
  },
  {
    path: '/plots',
    name: 'Plots',
    component: PlotsView
  },
  {
    path: '/plots/:id',
    name: 'PlotDetail',
    component: PlotDetail,
    props: true
  },
  {
    path: '/locations',
    name: 'Locations',
    component: LocationsView
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings
  },
  {
    path: '/sync',
    name: 'Sync',
    component: SyncView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router 