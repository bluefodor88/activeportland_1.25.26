import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useChatContacts } from '@/hooks/useChatContacts';

interface Participant {
  id: string
  name: string
  email: string
  avatar_url?: string
}

interface ParticipantSelectorProps {
  selectedParticipants: Participant[]
  onParticipantsChange: (participants: Participant[]) => void
  maxParticipants?: number
}

export function ParticipantSelector({ 
  selectedParticipants, 
  onParticipantsChange, 
  maxParticipants = 7 
}: ParticipantSelectorProps) {
  const { contacts, searchAllUsers } = useChatContacts()
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<Participant[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  useEffect(() => {
    if (searchTerm.trim()) {
      performSearch()
    } else {
      setSearchResults([])
      setShowSuggestions(false)
    }
  }, [searchTerm])

  const performSearch = async () => {
    if (!searchTerm.trim()) return

    // Search in chat contacts first
    const contactResults = contacts.filter(contact =>
      contact.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !selectedParticipants.some(p => p.id === contact.id)
    )

    // Search all users if we need more results
    const allUserResults = await searchAllUsers(searchTerm)
    const filteredAllUsers = allUserResults.filter(user =>
      !selectedParticipants.some(p => p.id === user.id) &&
      !contactResults.some(c => c.id === user.id)
    )

    const combinedResults = [...contactResults, ...filteredAllUsers].slice(0, 8)
    setSearchResults(combinedResults)
    setShowSuggestions(true)
  }

  const addParticipant = (participant: Participant) => {
    if (selectedParticipants.length >= maxParticipants) return
    
    const newParticipants = [...selectedParticipants, participant]
    onParticipantsChange(newParticipants)
    setSearchTerm('')
    setShowSuggestions(false)
  }

  const removeParticipant = (participantId: string) => {
    const newParticipants = selectedParticipants.filter(p => p.id !== participantId)
    onParticipantsChange(newParticipants)
  }

  const renderSelectedParticipant = ({ item }: { item: Participant }) => (
    <View style={styles.selectedParticipant}>
      <Image 
        source={{ 
          uri: item.avatar_url || 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&dpr=2' 
        }} 
        style={styles.selectedAvatar} 
      />
      <Text style={styles.selectedName} numberOfLines={1}>{item.name}</Text>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => removeParticipant(item.id)}
      >
                <Ionicons name="close" size={16} color="#F44336" />
      </TouchableOpacity>
    </View>
  )

  const renderSuggestion = ({ item }: { item: Participant }) => (
    <TouchableOpacity
      style={styles.suggestionItem}
      onPress={() => addParticipant(item)}
    >
      <Image 
        source={{ 
          uri: item.avatar_url || 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&dpr=2' 
        }} 
        style={styles.suggestionAvatar} 
      />
      <View style={styles.suggestionInfo}>
        <Text style={styles.suggestionName}>{item.name}</Text>
      </View>
      <View style={styles.addBadge}>
        <Ionicons name="add" size={16} color="white" />
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Invite People</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>
            {selectedParticipants.length}/{maxParticipants}
          </Text>
        </View>
      </View>
      
      {/* Selected Participants */}
      {selectedParticipants.length > 0 && (
        <View style={styles.selectedChips}>
          {selectedParticipants.map((p) => (
            <View key={p.id}>{renderSelectedParticipant({ item: p })}</View>
          ))}
        </View>
      )}

      {/* Search Input */}
      {selectedParticipants.length < maxParticipants && (
        <View style={styles.searchContainer}>
          <View style={styles.toBadge}>
            <Text style={styles.toBadgeText}>To</Text>
          </View>
          <Ionicons name="search" size={18} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Type a name"
            placeholderTextColor="#999"
          />
        </View>
      )}

      {/* Search Suggestions */}
      {showSuggestions && searchResults.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <ScrollView
            style={styles.suggestionsList}
            nestedScrollEnabled={true}
          >
            {searchResults.map((item) => (
              <View key={item.id}>{renderSuggestion({ item })}</View>
            ))}
          </ScrollView>
        </View>
      )}

      {showSuggestions && searchResults.length === 0 && searchTerm.trim() && (
        <View style={styles.noResultsContainer}>
          <Text style={styles.noResultsText}>No users found matching "{searchTerm}"</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  countBadge: {
    backgroundColor: '#FFF3E0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#FF8C42',
  },
  selectedChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  selectedParticipant: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7EE',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#FFE0C2',
  },
  selectedAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
  },
  selectedName: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginRight: 6,
  },
  removeButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFE0C2',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#EEE',
    marginBottom: 8,
  },
  toBadge: {
    backgroundColor: '#FF8C42',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  toBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: 'white',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    paddingVertical: 12,
    color: '#333',
  },
  suggestionsContainer: {
    backgroundColor: 'white',
    borderRadius: 14,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#eee',
    overflow: 'hidden',
  },
  suggestionsList: {
    maxHeight: 200,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  suggestionAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  suggestionInfo: {
    flex: 1,
  },
  suggestionName: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  addBadge: {
    backgroundColor: '#FF8C42',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionEmail: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  noResultsContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eee',
  },
  noResultsText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
  },
})
