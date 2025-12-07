import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Image,
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
        <Text style={styles.suggestionEmail}>{item.email}</Text>
      </View>
                <Ionicons name="add" size={20} color="#4CAF50" />
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        Invite People ({selectedParticipants.length}/{maxParticipants})
      </Text>
      
      {/* Selected Participants */}
      {selectedParticipants.length > 0 && (
        <FlatList
          data={selectedParticipants}
          renderItem={renderSelectedParticipant}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.selectedList}
          contentContainerStyle={styles.selectedListContent}
        />
      )}

      {/* Search Input */}
      {selectedParticipants.length < maxParticipants && (
        <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search people by name..."
            placeholderTextColor="#999"
          />
        </View>
      )}

      {/* Search Suggestions */}
      {showSuggestions && searchResults.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <FlatList
            data={searchResults}
            renderItem={renderSuggestion}
            keyExtractor={(item) => item.id}
            style={styles.suggestionsList}
            nestedScrollEnabled={true}
          />
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
  label: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
    marginBottom: 12,
  },
  selectedList: {
    marginBottom: 12,
  },
  selectedListContent: {
    paddingRight: 16,
  },
  selectedParticipant: {
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    padding: 8,
    minWidth: 80,
    position: 'relative',
  },
  selectedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 4,
  },
  selectedName: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#333',
    textAlign: 'center',
  },
  removeButton: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'white',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
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
    borderRadius: 12,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#eee',
  },
  suggestionsList: {
    maxHeight: 200,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
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
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
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