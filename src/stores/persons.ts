// PowerSync store for managing persons (deceased individuals)
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useElectricStore } from './electric'
import type { PersonRecord } from '../electric-schema'

export interface PersonData {
  id: string
  plot_id: string
  title: string
  forename: string
  middle_name: string
  surname: string
  full_name: string
  address_line1: string
  address_line2: string
  town: string
  county: string
  country: string
  postcode: string
  mobile: string
  landline: string
  email_address: string
  gender: string
  date_of_birth: string
  deceased: boolean
  notes: string
  race: string
  ethnicity: string
  created_by: string
  date_created: string
  last_updated_by: string
  last_updated_datetime: string
  birth_city: string
  birth_sub_country: string
  birth_country: string
  marital_status: string
  known_as: string
  maiden_name: string
  date_of_death: string
  age_at_death: number | null
  cause_of_death: string
  person_of_interest: boolean
  veteran: boolean
  time_of_death: string
}

export const usePersonsStore = defineStore('persons', () => {
  const electricStore = useElectricStore()
  
  // State
  const persons = ref<PersonData[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const deceasedPersons = computed(() => 
    persons.value.filter(person => person.deceased)
  )

  const personsByPlot = computed(() => {
    const grouped: Record<string, PersonData[]> = {}
    persons.value.forEach(person => {
      if (!grouped[person.plot_id]) {
        grouped[person.plot_id] = []
      }
      grouped[person.plot_id].push(person)
    })
    return grouped
  })

  // Actions
  const loadPersons = async () => {
    if (!electricStore.isInitialized) {
      await electricStore.initialize()
    }

    loading.value = true
    error.value = null

    try {
      const { data: results, error: fetchError } = await electricStore.supabaseClient
        .from('persons')
        .select('*')
        .order('surname', { ascending: true })
        .order('forename', { ascending: true })
      
      if (fetchError) throw fetchError

      persons.value = (results || []).map((person: any) => ({
        ...person,
        deceased: person.deceased === 'true' || person.deceased === true,
        person_of_interest: person.person_of_interest === 'true' || person.person_of_interest === true,
        veteran: person.veteran === 'true' || person.veteran === true,
        age_at_death: person.age_at_death ? parseInt(person.age_at_death) : null
      }))

      console.log('Persons loaded:', persons.value.length)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load persons'
      console.error('Error loading persons:', err)
    } finally {
      loading.value = false
    }
  }

  const loadPersonsByPlot = async (plotId: string) => {
    if (!electricStore.isInitialized) {
      await electricStore.initialize()
    }

    try {
      const { data: results, error: fetchError } = await electricStore.supabaseClient
        .from('persons')
        .select('*')
        .eq('plot_id', plotId)
        .order('surname', { ascending: true })
        .order('forename', { ascending: true })
      
      if (fetchError) throw fetchError

      return (results || []).map((person: any) => ({
        ...person,
        deceased: person.deceased === 'true' || person.deceased === true,
        person_of_interest: person.person_of_interest === 'true' || person.person_of_interest === true,
        veteran: person.veteran === 'true' || person.veteran === true,
        age_at_death: person.age_at_death ? parseInt(person.age_at_death) : null
      }))
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load persons for plot'
      console.error('Error loading persons for plot:', err)
      return []
    }
  }

  const createPerson = async (personData: Partial<PersonData>): Promise<PersonData | null> => {
    if (!electricStore.isInitialized) {
      await electricStore.initialize()
    }

    const personId = `person_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = new Date().toISOString()

    // Generate full name
    const fullName = [
      personData.title || '',
      personData.forename || '',
      personData.middle_name || '',
      personData.surname || ''
    ].filter(Boolean).join(' ')

    const newPerson: PersonRecord = {
      id: personId,
      plot_id: personData.plot_id || '',
      title: personData.title || '',
      forename: personData.forename || '',
      middle_name: personData.middle_name || '',
      surname: personData.surname || '',
      full_name: fullName,
      address_line1: personData.address_line1 || '',
      address_line2: personData.address_line2 || '',
      town: personData.town || '',
      county: personData.county || '',
      country: personData.country || '',
      postcode: personData.postcode || '',
      mobile: personData.mobile || '',
      landline: personData.landline || '',
      email_address: personData.email_address || '',
      gender: personData.gender || '',
      date_of_birth: personData.date_of_birth || '',
      deceased: personData.deceased ? 'true' : 'false',
      notes: personData.notes || '',
      race: personData.race || '',
      ethnicity: personData.ethnicity || '',
      created_by: personData.created_by || 'anonymous',
      date_created: now,
      last_updated_by: personData.last_updated_by || 'anonymous',
      last_updated_datetime: now,
      birth_city: personData.birth_city || '',
      birth_sub_country: personData.birth_sub_country || '',
      birth_country: personData.birth_country || '',
      marital_status: personData.marital_status || '',
      known_as: personData.known_as || '',
      maiden_name: personData.maiden_name || '',
      date_of_death: personData.date_of_death || '',
      age_at_death: personData.age_at_death !== null && personData.age_at_death !== undefined ? personData.age_at_death.toString() : null,
      cause_of_death: personData.cause_of_death || '',
      person_of_interest: personData.person_of_interest ? 'true' : 'false',
      veteran: personData.veteran ? 'true' : 'false',
      time_of_death: personData.time_of_death || null
    }

    try {
      console.log('🔍 PersonsStore: About to execute INSERT for person:', newPerson.id)
      console.log('🔍 PersonsStore: INSERT data:', newPerson)
      
      const { error: insertError } = await electricStore.supabaseClient
        .from('persons')
        .insert(newPerson)
      
      if (insertError) throw insertError
      
      console.log('✅ PersonsStore: INSERT executed successfully for person:', newPerson.id)

      // Reload persons to get the new one
      await loadPersons()

      console.log('Person created successfully:', personId)
      return persons.value.find(p => p.id === personId) || null
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create person'
      console.error('Error creating person:', err)
      return null
    }
  }

  const updatePerson = async (personId: string, updates: Partial<PersonData>): Promise<boolean> => {
    if (!electricStore.isInitialized) {
      await electricStore.initialize()
    }

    const now = new Date().toISOString()

    // Generate full name if name fields are being updated
    let fullName = updates.full_name
    if (updates.title || updates.forename || updates.middle_name || updates.surname) {
      const person = persons.value.find(p => p.id === personId)
      if (person) {
        const title = updates.title !== undefined ? updates.title : person.title
        const forename = updates.forename !== undefined ? updates.forename : person.forename
        const middleName = updates.middle_name !== undefined ? updates.middle_name : person.middle_name
        const surname = updates.surname !== undefined ? updates.surname : person.surname
        
        fullName = [title, forename, middleName, surname].filter(Boolean).join(' ')
      }
    }

    try {
      // Removed - using updateObj directly instead

      // Build dynamic update query
      const fieldMappings = {
        title: 'title',
        forename: 'forename',
        middle_name: 'middle_name',
        surname: 'surname',
        full_name: 'full_name',
        address_line1: 'address_line1',
        address_line2: 'address_line2',
        town: 'town',
        county: 'county',
        country: 'country',
        postcode: 'postcode',
        mobile: 'mobile',
        landline: 'landline',
        email_address: 'email_address',
        gender: 'gender',
        date_of_birth: 'date_of_birth',
        deceased: 'deceased',
        notes: 'notes',
        race: 'race',
        ethnicity: 'ethnicity',
        birth_city: 'birth_city',
        birth_sub_country: 'birth_sub_country',
        birth_country: 'birth_country',
        marital_status: 'marital_status',
        known_as: 'known_as',
        maiden_name: 'maiden_name',
        date_of_death: 'date_of_death',
        age_at_death: 'age_at_death',
        cause_of_death: 'cause_of_death',
        person_of_interest: 'person_of_interest',
        veteran: 'veteran',
        time_of_death: 'time_of_death'
      }

      // Build update object directly
      const updateObj: Record<string, any> = {}

      for (const [key, dbField] of Object.entries(fieldMappings)) {
        if (updates[key as keyof PersonData] !== undefined) {
          updateObj[dbField] = updates[key as keyof PersonData]
        }
      }

      // Handle boolean fields (convert to strings)
      if (updates.deceased !== undefined) {
        updateObj.deceased = updates.deceased ? 'true' : 'false'
      }
      if (updates.person_of_interest !== undefined) {
        updateObj.person_of_interest = updates.person_of_interest ? 'true' : 'false'
      }
      if (updates.veteran !== undefined) {
        updateObj.veteran = updates.veteran ? 'true' : 'false'
          }

      // Handle age_at_death (convert number to string)
      if (updates.age_at_death !== undefined) {
        updateObj.age_at_death = updates.age_at_death !== null ? updates.age_at_death.toString() : null
      }

      // Add full_name if name fields were updated
      if (fullName) {
        updateObj.full_name = fullName
      }

      // Add last_updated_datetime
      updateObj.last_updated_datetime = now

      if (Object.keys(updateObj).length === 0) {
        return true // No updates to make
      }

      const { error: updateError } = await electricStore.supabaseClient
        .from('persons')
        .update(updateObj)
        .eq('id', personId)
      
      if (updateError) throw updateError

      // Reload persons to get the updated data
      await loadPersons()

      console.log('Person updated successfully:', personId)
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update person'
      console.error('Error updating person:', err)
      return false
    }
  }

  const deletePerson = async (personId: string): Promise<boolean> => {
    if (!electricStore.isInitialized) {
      await electricStore.initialize()
    }

    try {
      const { error: deleteError } = await electricStore.supabaseClient
        .from('persons')
        .delete()
        .eq('id', personId)
      
      if (deleteError) throw deleteError

      // Remove from local state
      persons.value = persons.value.filter(p => p.id !== personId)

      console.log('Person deleted successfully:', personId)
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete person'
      console.error('Error deleting person:', err)
      return false
    }
  }

  const searchPersons = (query: string): PersonData[] => {
    if (!query.trim()) return persons.value

    const searchTerm = query.toLowerCase()
    return persons.value.filter(person => 
      person.full_name.toLowerCase().includes(searchTerm) ||
      person.surname.toLowerCase().includes(searchTerm) ||
      person.forename.toLowerCase().includes(searchTerm) ||
      person.known_as.toLowerCase().includes(searchTerm) ||
      person.maiden_name.toLowerCase().includes(searchTerm)
    )
  }

  const getPersonById = (personId: string): PersonData | undefined => {
    return persons.value.find(p => p.id === personId)
  }

  const getPersonsByPlot = (plotId: string): PersonData[] => {
    const filtered = persons.value.filter(p => p.plot_id === plotId)
    console.log('🔍 PersonsStore: getPersonsByPlot called for plot ID:', plotId)
    console.log('🔍 PersonsStore: Total persons loaded:', persons.value.length)
    console.log('🔍 PersonsStore: Persons for this plot:', filtered.length)
    console.log('🔍 PersonsStore: Filtered persons data:', filtered)
    return filtered
  }

  return {
    // State
    persons,
    loading,
    error,
    
    // Computed
    deceasedPersons,
    personsByPlot,
    
    // Actions
    loadPersons,
    loadPersonsByPlot,
    createPerson,
    updatePerson,
    deletePerson,
    searchPersons,
    getPersonById,
    getPersonsByPlot
  }
})
