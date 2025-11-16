// PowerSync store for managing persons (deceased individuals)
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { usePowerSyncStore } from './powersync'
import type { PersonRecord } from '../powersync-schema'

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
  const powerSyncStore = usePowerSyncStore()
  const powerSync = computed(() => powerSyncStore.powerSync)
  
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
    if (!powerSync.value) {
      error.value = 'PowerSync not initialized'
      return
    }

    loading.value = true
    error.value = null

    try {
      const results = await powerSync.value.getAll(
        'SELECT * FROM persons ORDER BY surname, forename'
      )

      persons.value = results.map((person: any) => ({
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
    if (!powerSync.value) {
      error.value = 'PowerSync not initialized'
      return []
    }

    try {
      const results = await powerSync.value.getAll(
        'SELECT * FROM persons WHERE plot_id = ? ORDER BY surname, forename',
        [plotId]
      )

      return results.map((person: any) => ({
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
    if (!powerSync.value) {
      error.value = 'PowerSync not initialized'
      return null
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
      
      await powerSync.value.execute(
        `INSERT INTO persons (
          id, plot_id, title, forename, middle_name, surname, full_name,
          address_line1, address_line2, town, county, country, postcode,
          mobile, landline, email_address, gender, date_of_birth, deceased,
          notes, race, ethnicity, created_by, date_created, last_updated_by,
          last_updated_datetime, birth_city, birth_sub_country, birth_country,
          marital_status, known_as, maiden_name, date_of_death, age_at_death,
          cause_of_death, person_of_interest, veteran, time_of_death
   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newPerson.id, newPerson.plot_id, newPerson.title, newPerson.forename,
          newPerson.middle_name, newPerson.surname, newPerson.full_name,
          newPerson.address_line1, newPerson.address_line2, newPerson.town,
          newPerson.county, newPerson.country, newPerson.postcode,
          newPerson.mobile, newPerson.landline, newPerson.email_address,
          newPerson.gender, newPerson.date_of_birth, newPerson.deceased,
          newPerson.notes, newPerson.race, newPerson.ethnicity,
          newPerson.created_by, newPerson.date_created, newPerson.last_updated_by,
          newPerson.last_updated_datetime, newPerson.birth_city, newPerson.birth_sub_country,
          newPerson.birth_country, newPerson.marital_status, newPerson.known_as,
          newPerson.maiden_name, newPerson.date_of_death, newPerson.age_at_death,
          newPerson.cause_of_death, newPerson.person_of_interest, newPerson.veteran,
          newPerson.time_of_death
        ]
      )
      
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
    if (!powerSync.value) {
      error.value = 'PowerSync not initialized'
      return false
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
      const updateFields = []
      const updateValues = []

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

      for (const [key, dbField] of Object.entries(fieldMappings)) {
        if (updates[key as keyof PersonData] !== undefined) {
          updateFields.push(`${dbField} = ?`)
          let value = updates[key as keyof PersonData]
          
          // Convert boolean values to strings
          if (key === 'deceased' || key === 'person_of_interest' || key === 'veteran') {
            value = value ? 'true' : 'false'
          }
          // Convert number to string
          else if (key === 'age_at_death') {
            value = value !== null && value !== undefined ? value.toString() : null
          }
          
          updateValues.push(value)
        }
      }

      if (updateFields.length === 0) {
        return true // No updates to make
      }

      // Add full_name if name fields were updated
      if (fullName) {
        updateFields.push('full_name = ?')
        updateValues.push(fullName)
      }

      // Add last_updated_datetime
      updateFields.push('last_updated_datetime = ?')
      updateValues.push(now)

      // Add personId for WHERE clause
      updateValues.push(personId)

      const query = `UPDATE persons SET ${updateFields.join(', ')} WHERE id = ?`
      
      await powerSync.value.execute(query, updateValues)

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
    if (!powerSync.value) {
      error.value = 'PowerSync not initialized'
      return false
    }

    try {
      await powerSync.value.execute('DELETE FROM persons WHERE id = ?', [personId])

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
