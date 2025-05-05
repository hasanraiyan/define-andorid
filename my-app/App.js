
import React, {
  useState,
  useEffect,
  useContext,
  createContext,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  StyleSheet,
  View,
  Text, // Ensure Text is imported
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Platform,
  Keyboard,
  Alert,
  Animated,
  Linking,
  Dimensions,
  StatusBar,
} from 'react-native';

// Expo Core & Installable Libraries
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons, FontAwesome5, Ionicons } from '@expo/vector-icons'; // FontAwesome5 and Ionicons seem unused directly, but kept for potential future use or if implicitly used elsewhere
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// --- Constants ---
const API_BASE_URL = 'https://define-i05a.onrender.com';
const DEFINE_ENDPOINT = `${API_BASE_URL}/api/define`;
const MAX_REQUESTED_LENGTH = 250;
const HISTORY_MAX_ITEMS = 50;
const TOAST_DURATION = 3000;
const APP_VERSION = '2.2.1'; // Updated Version for UI Polish

// --- Storage Keys ---
const CACHE_KEY_PREFIX = '@DefinitionCache:';
const FAVORITES_KEY = '@VocabMaster:favorites_v2';
const HISTORY_KEY = '@VocabMaster:history_v2';
const QUIZ_LIST_KEY = '@VocabMaster:quizList_v2';
const CACHE_INDEX_KEY = '@VocabMaster:definitionsCacheIndex_v2';

// --- Color Palette ---
const COLORS = {
  primary: '#3949AB', primaryDark: '#303F9F', primaryLight: '#5C6BC0',
  accent: '#FFA000', error: '#D32F2F', errorBackground: '#FFEBEE',
  success: '#388E3C', successBackground: '#E8F5E9', info: '#1976D2', infoBackground: '#E3F2FD',
  textPrimary: '#212121', textSecondary: '#757575', textDisabled: '#BDBDBD',
  background: '#F5F5F5', surface: '#FFFFFF', border: '#E0E0E0', inputBackground: '#FAFAFA',
  quizAccent: '#7E57C2', quizAccentLight: '#F3E5F5', chipBackground: '#E8EAF6',
  toastText: '#FFFFFF', tabBarBackground: '#FFFFFF', tabBarActiveTint: '#303F9F',
  tabBarInactiveTint: '#757575', tabBarActiveBackground: '#E8EAF6',
};

// --- Utility Functions ---
const validateInputs = (wordToValidate, lengthToValidate) => {
  if (!wordToValidate || !wordToValidate.trim()) { return 'Please enter a word or phrase.'; }
  const numLength = parseInt(lengthToValidate, 10);
  if (isNaN(numLength) || numLength < 1 || numLength > MAX_REQUESTED_LENGTH) { return `Please enter a valid length (1-${MAX_REQUESTED_LENGTH}).`; }
  return null; // No error
};
const generateCacheKey = (params) => {
  // Ensure consistent key generation, handling potentially undefined values gracefully
  const keyParams = {
    word: (params.word || '').trim().toLowerCase(),
    length: parseInt(params.length || 0, 10),
    tone: (params.tone || 'neutral').toLowerCase(),
    context: (params.context || 'none').toLowerCase(),
    lang: (params.lang || 'auto').toLowerCase()
  };
  // Sort keys for consistent JSON stringification regardless of object creation order
  const sortedKeys = Object.keys(keyParams).sort();
  const sortedParams = {};
  sortedKeys.forEach(key => {
    sortedParams[key] = keyParams[key];
  });
  return `${CACHE_KEY_PREFIX}${JSON.stringify(sortedParams)}`;
};

// --- App Context ---
const AppContext = createContext();

// --- App Provider Component ---
// FIX: Removed incorrect try/catch wrapper around the function definition
const AppProvider = ({ children }) => {
  // Form State
  const [word, setWord] = useState('');
  const [length, setLength] = useState('30');
  const [tone, setTone] = useState('');
  const [contextValue, setContextValue] = useState('');
  const [lang, setLang] = useState('');
  const [showOptionalFilters, setShowOptionalFilters] = useState(false);

  // API/UI State
  const [definitionResult, setDefinitionResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Simplified Persistent State Hook (Kept condensed as per original code)
  // Note: Improved loading indication might be desired for a better UX during initial load flicker.
  const useSimplePersistentState = (key, initialValue) => { const [st, setSt] = useState(initialValue); const [ld, setLd] = useState(false); useEffect(() => { AsyncStorage.getItem(key).then(v => { if (v !== null) { try { setSt(JSON.parse(v)); } catch (e) { console.error(`Parse Error (${key}):`, e); /* Keep initialValue or setSt([])/setSt({}) ? */ } } }).catch(e => console.error(`Load Error (${key}):`, e)).finally(() => setLd(true)); }, [key]); useEffect(() => { if (ld) { AsyncStorage.setItem(key, JSON.stringify(st)).catch(e => console.error(`Save Error (${key}):`, e)); } }, [key, st, ld]); return [st, setSt, ld]; };
  const [favorites, setFavorites, favLoaded] = useSimplePersistentState(FAVORITES_KEY, []);
  const [history, setHistory, histLoaded] = useSimplePersistentState(HISTORY_KEY, []);
  const [quizList, setQuizList, quizLoaded] = useSimplePersistentState(QUIZ_LIST_KEY, []);
  const [definitionsCacheIndex, setDefinitionsCacheIndex, cacheIdxLoaded] = useSimplePersistentState(CACHE_INDEX_KEY, {});

  // Sorting State
  const [favSortOrder, setFavSortOrder] = useState('newest');
  const [histSortOrder, setHistSortOrder] = useState('newest');

  // Toast State
  const [toastState, setToastState] = useState({ visible: false, message: '', type: 'info' });
  const isInitialDataLoaded = favLoaded && histLoaded && quizLoaded && cacheIdxLoaded;

  // --- Actions ---
  const showToast = useCallback((message, type = 'info', duration = TOAST_DURATION) => {
    // Ensure message is a string
    const msg = String(message || '');
    setToastState({ visible: true, message: msg, type });
    setTimeout(() => {
      // Hide only if the current toast is still visible (prevents premature hiding from rapid calls)
      setToastState(prev => (prev.message === msg && prev.visible ? { ...prev, visible: false } : prev));
    }, duration);
  }, []); // Dependency array is empty as it only uses setToastState and constants

  const getCachedDefinition = useCallback(async (params) => {
    if (!isInitialDataLoaded) {
      console.log("getCachedDefinition: Initial data not loaded yet.");
      return null;
    }
    const cacheKey = generateCacheKey(params);
    if (!definitionsCacheIndex[cacheKey]) {
      // console.log(`getCachedDefinition: Key not in index: ${cacheKey}`);
      return null;
    }
    // console.log(`getCachedDefinition: Trying to read key: ${cacheKey}`);
    try {
      const definitionData = await AsyncStorage.getItem(cacheKey);
      if (definitionData) {
        // console.log(`getCachedDefinition: Cache hit for key: ${cacheKey}`);
        return { ...JSON.parse(definitionData), cacheHit: true };
      } else {
        // Data not found, but key was in index - inconsistent state, remove from index
        console.warn(`Cache inconsistency: Key ${cacheKey} in index but data missing. Removing from index.`);
        setDefinitionsCacheIndex(prev => {
          const newIndex = { ...prev };
          delete newIndex[cacheKey];
          return newIndex;
        });
        return null;
      }
    } catch (e) {
      console.error("Cache read error:", e);
      // Optionally remove the problematic key from the index
      setDefinitionsCacheIndex(prev => {
        const newIndex = { ...prev };
        delete newIndex[cacheKey];
        return newIndex;
      });
      return null;
    }
  }, [isInitialDataLoaded, definitionsCacheIndex, setDefinitionsCacheIndex]); // Dependencies are correct

  const saveToCache = useCallback(async (params, resultData) => {
    const cacheKey = generateCacheKey(params);
    try {
      // Add current timestamp to the data being saved (useful for potential future pruning)
      const dataToSave = { ...resultData, savedAt: Date.now() };
      await AsyncStorage.setItem(cacheKey, JSON.stringify(dataToSave));
      // Update the index with the key and current timestamp
      setDefinitionsCacheIndex(prev => ({ ...prev, [cacheKey]: Date.now() }));
      // console.log(`saveToCache: Saved data for key: ${cacheKey}`);
    } catch (e) {
      console.error("Cache write error:", e);
      showToast('Could not save definition locally.', 'error');
      // Consider if the index should be updated even if save fails (might lead to inconsistency)
    }
  }, [setDefinitionsCacheIndex, showToast]); // Dependencies are correct

  const clearCache = useCallback(async () => {
    let clearedCount = 0;
    try {
      const keysToRemove = Object.keys(definitionsCacheIndex);
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
        clearedCount = keysToRemove.length;
      }
      // Always clear the index, even if multiRemove failed partially or keysToRemove was empty
      setDefinitionsCacheIndex({});
      showToast(`${clearedCount} definition(s) cleared from cache.`, 'success');
    } catch (e) {
      console.error("Cache clear error:", e);
      showToast('Cache clear failed. Some items might remain.', 'error');
      // Attempt to clear index anyway to avoid inconsistency
      setDefinitionsCacheIndex({});
    }
  }, [definitionsCacheIndex, setDefinitionsCacheIndex, showToast]); // Dependencies are correct

  const addToHistory = useCallback((item) => {
    if (!item || !item.word) return; // Basic validation
    const newItem = { ...item, timestamp: Date.now() }; // Ensure timestamp is fresh

    setHistory(prevHistory => {
      // Filter out any previous entries for the exact same search parameters (word, length, tone, context, lang)
      // Case-insensitive comparison for word, tone, context, lang
      const updatedHistory = prevHistory.filter(h =>
        !(
          h.word.toLowerCase() === newItem.word.toLowerCase() &&
          h.length === newItem.length &&
          (h.tone || '').toLowerCase() === (newItem.tone || '').toLowerCase() &&
          (h.context || '').toLowerCase() === (newItem.context || '').toLowerCase() &&
          (h.lang || '').toLowerCase() === (newItem.lang || '').toLowerCase()
        )
      );

      // Add the new item to the beginning and slice to maintain max length
      return [newItem, ...updatedHistory].slice(0, HISTORY_MAX_ITEMS);
    });
  }, [setHistory]); // Dependency is correct

  const handleDefine = useCallback(async (params = {}) => {
    // Extract parameters, using passed params first, then state, then defaults
    const wordToDefine = (params.word || word || '').trim();
    const requestedLength = params.length || length;
    const toneParam = params.tone !== undefined ? params.tone : tone;
    const contextParam = params.context !== undefined ? params.context : contextValue;
    const langParam = params.lang !== undefined ? params.lang : lang;

    // Validate Inputs
    const validationError = validateInputs(wordToDefine, requestedLength);
    if (validationError) {
      setError(validationError);
      showToast(validationError, 'error');
      return; // Stop execution if validation fails
    }

    Keyboard.dismiss();
    setIsLoading(true);
    setError(null);
    setDefinitionResult(null); // Clear previous result immediately

    const requestParams = {
      word: wordToDefine,
      length: requestedLength,
      tone: toneParam || undefined, // Use undefined if empty string for cleaner cache key/API request
      context: contextParam || undefined,
      lang: langParam || undefined,
    };

    // 1. Check Cache
    const cachedResult = await getCachedDefinition(requestParams);
    if (cachedResult) {
      // console.log("handleDefine: Cache hit!");
      setDefinitionResult(cachedResult);
      setIsLoading(false);
      addToHistory({
        word: cachedResult.word,
        length: cachedResult.requestedLength, // Use requested length stored in cache item
        tone: cachedResult.config?.tone,
        context: cachedResult.config?.context,
        lang: cachedResult.config?.effectiveLang,
        // timestamp: Date.now(), // addToHistory adds its own timestamp
        result: {
          actualLength: cachedResult.actualLength,
          status: cachedResult.status,
          effectiveLang: cachedResult.config?.effectiveLang
        }
      });
      showToast('Definition loaded from local cache.', 'info');
      return; // Stop execution after cache hit
    }

    // 2. Fetch from API if not cached
    // console.log("handleDefine: Cache miss, fetching from API...");
    try {
      const apiRequestBody = {
        word: wordToDefine,
        length: parseInt(requestedLength, 10), // Ensure length is integer
        // Only include optional params if they have a value
        ...(toneParam && { tone: toneParam }),
        ...(contextParam && { context: contextParam }),
        ...(langParam && { lang: langParam }),
      };

      const response = await fetch(DEFINE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(apiRequestBody),
      });

      const responseData = await response.json();

      if (!response.ok) {
        // Use error message from API if available, otherwise generic message
        throw new Error(responseData.message || `API request failed with status: ${response.status}`);
      }

      // Success: Process and store result
      const finalResultData = {
        ...responseData,
        requestedLength: parseInt(requestedLength, 10), // Store the requested length with the result
        cacheHit: false, // Mark as not from cache
      };

      setDefinitionResult(finalResultData);
      addToHistory({
        word: finalResultData.word,
        length: finalResultData.requestedLength,
        tone: finalResultData.config?.tone,
        context: finalResultData.config?.context,
        lang: finalResultData.config?.effectiveLang,
        // timestamp: Date.now(), // Handled by addToHistory
        result: { // Store some key result info in history
          actualLength: finalResultData.actualLength,
          status: finalResultData.status,
          effectiveLang: finalResultData.config?.effectiveLang
        }
      });
      // Save the successful API response to cache
      await saveToCache(requestParams, finalResultData);

    } catch (error) {
      console.error('API Fetch/Processing Error:', error);
      const errorMessage = error.message || 'An unexpected error occurred while fetching the definition.';
      setError(errorMessage);
      setDefinitionResult(null); // Ensure no stale result is shown on error
      showToast(errorMessage, 'error');
    } finally {
      setIsLoading(false); // Ensure loading indicator is hidden
    }
  }, [
    word, length, tone, contextValue, lang, // Current form state
    getCachedDefinition, saveToCache, addToHistory, showToast, // Actions/helpers
    isInitialDataLoaded, // Ensure data is loaded before attempting cache ops (though checked in getCachedDefinition too)
    // No need to depend on setDefinitionResult, setError, setIsLoading directly in useCallback
  ]); // Dependencies seem correct

  const clearSearch = useCallback(() => {
    setWord('');
    // Keep length as is? Resetting might be annoying. Let's keep it.
    // setLength('30');
    setTone('');
    setContextValue('');
    setLang('');
    setError(null);
    setDefinitionResult(null);
    setShowOptionalFilters(false); // Hide filters on clear
    Keyboard.dismiss();
  }, [/* Dependencies: only setters are used, so empty array is fine */]);

  const addFavorite = useCallback((wordToAdd) => {
    if (!wordToAdd || !wordToAdd.trim()) return;
    const trimmedWord = wordToAdd.trim();
    // Check case-insensitively
    if (!favorites.some(fav => fav.word.toLowerCase() === trimmedWord.toLowerCase())) {
      setFavorites(prevFavorites => [{ word: trimmedWord, timestamp: Date.now() }, ...prevFavorites]);
      showToast(`Favorited: ${trimmedWord}`, 'success');
    } else {
      showToast(`${trimmedWord} is already in favorites.`, 'info');
    }
  }, [favorites, setFavorites, showToast]); // Dependencies are correct

  const removeFavorite = useCallback((wordToRemove) => {
    if (!wordToRemove || !wordToRemove.trim()) return;
    const trimmedWord = wordToRemove.trim();
    setFavorites(prevFavorites => prevFavorites.filter(fav => fav.word.toLowerCase() !== trimmedWord.toLowerCase()));
    showToast(`Unfavorited: ${trimmedWord}`, 'info');
  }, [setFavorites, showToast]); // Dependencies are correct

  const isFavorite = useCallback((wordToCheck) => {
    if (!wordToCheck || !wordToCheck.trim()) return false;
    const trimmedWord = wordToCheck.trim();
    return favorites.some(fav => fav.word.toLowerCase() === trimmedWord.toLowerCase());
  }, [favorites]); // Dependency is correct

  const clearHistory = useCallback(() => {
    Alert.alert(
      "Clear Search History",
      "Are you sure you want to delete all search history items? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear All", onPress: () => { setHistory([]); showToast('Search History Cleared', 'success'); }, style: "destructive" }
      ]
    );
  }, [setHistory, showToast]); // Dependencies are correct

  const addToQuiz = useCallback((wordToAdd) => {
    if (!wordToAdd || !wordToAdd.trim()) return;
    const trimmedWord = wordToAdd.trim();
    // Check case-insensitively
    if (!quizList.some(item => item.word.toLowerCase() === trimmedWord.toLowerCase())) {
      const newItem = { word: trimmedWord, id: Date.now().toString() }; // Use timestamp string as unique ID
      setQuizList(prevQuizList => [newItem, ...prevQuizList]);
      showToast(`Added to Quiz List: ${trimmedWord}`, 'success');
    } else {
      showToast(`${trimmedWord} is already in the Quiz list.`, 'info');
    }
  }, [quizList, setQuizList, showToast]); // Dependencies are correct

  const removeFromQuiz = useCallback((idToRemove) => {
    const word = quizList.find(item => item.id === idToRemove)?.word || 'Word';
    setQuizList(prevQuizList => prevQuizList.filter(item => item.id !== idToRemove));
    showToast(`Removed from Quiz List: ${word}`, 'info');
  }, [quizList, setQuizList, showToast]); // Dependencies are correct

  // --- Sorted Lists ---
  // Use stable sort functions if needed, but localeCompare/timestamp diff is usually sufficient
  const sortedFavorites = useMemo(() => {
    const sorted = [...favorites]; // Create a shallow copy
    sorted.sort((a, b) => {
      switch (favSortOrder) {
        case 'a-z': return (a.word || '').localeCompare(b.word || '');
        case 'z-a': return (b.word || '').localeCompare(a.word || '');
        case 'oldest': return (a.timestamp || 0) - (b.timestamp || 0);
        case 'newest':
        default: return (b.timestamp || 0) - (a.timestamp || 0);
      }
    });
    return sorted;
  }, [favorites, favSortOrder]);

  const sortedHistory = useMemo(() => {
    const sorted = [...history]; // Create a shallow copy
    sorted.sort((a, b) => {
      switch (histSortOrder) {
        case 'a-z': return (a.word || '').localeCompare(b.word || '');
        case 'z-a': return (b.word || '').localeCompare(a.word || '');
        case 'oldest': return (a.timestamp || 0) - (b.timestamp || 0);
        case 'newest':
        default: return (b.timestamp || 0) - (a.timestamp || 0);
      }
    });
    return sorted;
  }, [history, histSortOrder]);

  // --- Context Value Object ---
  // Memoize the provider value to prevent unnecessary re-renders of consumers
  // if the provider's parent re-renders but the context values haven't changed.
  const providerValue = useMemo(() => ({
    // State
    word, setWord, length, setLength, tone, setTone, contextValue, setContextValue, lang, setLang,
    showOptionalFilters, setShowOptionalFilters, definitionResult, isLoading, error, setError,
    favorites, sortedFavorites, favSortOrder, setFavSortOrder, history, sortedHistory,
    histSortOrder, setHistSortOrder, quizList, isInitialDataLoaded,

    // Actions / Helpers
    handleDefine, clearSearch, addFavorite, removeFavorite, isFavorite, clearHistory,
    addToQuiz, removeFromQuiz, clearCache, showToast,
  }), [
    // Include all values provided in the context object as dependencies
    word, length, tone, contextValue, lang, showOptionalFilters, definitionResult, isLoading, error,
    favorites, sortedFavorites, favSortOrder, history, sortedHistory, histSortOrder, quizList,
    isInitialDataLoaded, handleDefine, clearSearch, addFavorite, removeFavorite, isFavorite,
    clearHistory, addToQuiz, removeFromQuiz, clearCache, showToast,
    // Setters (like setWord) usually have stable identity from useState/useCallback,
    // but including them doesn't hurt and ensures correctness if they were ever redefined.
    setWord, setLength, setTone, setContextValue, setLang, setShowOptionalFilters, setError,
    setFavSortOrder, setHistSortOrder,
  ]);

  return (
    <AppContext.Provider value={providerValue}>
      {children}
      {/* Toast component needs to be outside the main navigation potentially,
          or rendered here to overlay everything. Rendering here is simpler. */}
      <CustomToast
        visible={toastState.visible}
        message={toastState.message}
        type={toastState.type}
      />
    </AppContext.Provider>
  );
};


// --- Reusable UI Components ---

const Header = React.memo(({ navigation, route, options: navOptions }) => {
  const insets = useSafeAreaInsets();
  const title = navOptions?.title ?? route?.name ?? 'VocabMaster Pro';
  // Determine if settings icon should be shown based on the *route name* within the tab navigator
  const currentRouteName = navigation.getState()?.routes[navigation.getState()?.index]?.name;
  const showSettings = ['Define', 'Favorites', 'History', 'Quiz'].includes(currentRouteName);
  const isModal = navOptions?.presentation === 'modal';

  return (
    <LinearGradient
      colors={[COLORS.primaryDark, COLORS.primary]} // Darker gradient
      style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'android' ? 10 : 5) }]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
    >
      <View style={styles.headerButtonContainer}>
        {/* Show back arrow only if navigation can go back AND it's not a main tab screen AND not overridden */}
        {navigation.canGoBack() && !showSettings && !navOptions?.headerLeft ? (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
            {Platform.OS === 'ios' ? (
              <Ionicons name="chevron-back" size={28} color={COLORS.surface} />
            ) : (
              <Ionicons name="arrow-back" size={24} color={COLORS.surface} />
            )}
          </TouchableOpacity>
        ) : <View style={{ width: 44 }} /> /* Placeholder to balance layout */}
      </View>

      <View style={styles.headerTitleContainer}>
        <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">{title}</Text>
      </View>

      <View style={styles.headerButtonContainer}>
        {/* Show settings icon on main tab screens */}
        {showSettings && !isModal ? (
          <TouchableOpacity onPress={() => navigation.navigate('SettingsModal')} style={styles.headerButton}>
            <MaterialIcons name="settings" size={24} color={COLORS.surface} />
          </TouchableOpacity>
        ) : isModal && Platform.OS !== 'ios' ? ( // Show close button for Android modals (iOS gets default)
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Ionicons name="close" size={28} color={COLORS.surface} />
          </TouchableOpacity>
        ) : <View style={{ width: 44 }} /> /* Placeholder to balance layout */}
      </View>
    </LinearGradient>
  );
});

const CustomToast = React.memo(({ visible, message, type }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const [isVisible, setIsVisible] = useState(visible); // Local state to manage mounting

  useEffect(() => {
    if (visible) {
      setIsVisible(true); // Mount component
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setIsVisible(false); // Unmount after fade out
      });
    }
  }, [visible, opacity]);

  const toastStyle = useMemo(() => {
    switch (type) {
      case 'success': return { backgroundColor: COLORS.success, icon: 'check-circle' };
      case 'error': return { backgroundColor: COLORS.error, icon: 'error' };
      case 'info':
      default: return { backgroundColor: COLORS.info, icon: 'info' };
    }
  }, [type]);

  // Avoid rendering if not visible (controlled by local state)
  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          opacity,
          backgroundColor: toastStyle.backgroundColor,
          // Position above tab bar or near bottom if no insets
          bottom: insets.bottom > 0 ? insets.bottom + 10 : (Platform.OS === 'ios' ? 75 : 20), // Adjusted bottom positioning
        },
      ]}
      // Accessibility for screen readers
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${type}: ${message}`}
    >
      <MaterialIcons name={toastStyle.icon} size={20} color={COLORS.toastText} style={styles.toastIcon} />
      {/* Ensure message is always treated as a string */}
      <Text style={styles.toastText}>{String(message || '')}</Text>
    </Animated.View>
  );
});

const SearchForm = React.memo(() => {
  const { word, setWord, length, setLength, tone, setTone, contextValue, setContextValue, lang, setLang, showOptionalFilters, setShowOptionalFilters, handleDefine, isLoading, error } = useContext(AppContext);
  const wordInputRef = useRef(null);
  const lengthInputRef = useRef(null);
  const toneInputRef = useRef(null);
  const contextInputRef = useRef(null);
  const langInputRef = useRef(null);

  const canDefine = useMemo(() => validateInputs(word, length) === null, [word, length]);
  const buttonTextContent = useMemo(() => `Define '${(word || '').trim() || 'Word'}'`, [word]); // Memoize button text

  // Handler to submit form if inputs are valid
  const submitDefine = useCallback(() => {
    if (canDefine && !isLoading) {
      handleDefine();
    } else {
      // Optionally focus the first invalid field or show validation error if not already shown
      const validationError = validateInputs(word, length);
      if (validationError && !error) { // Only show toast if no other error is active
        // Calling setError directly might conflict with API errors, context provides showToast
        // Using showToast from context might be better if available here
        Alert.alert("Validation Error", validationError); // Simple alert fallback
      }
    }
  }, [canDefine, isLoading, handleDefine, word, length, error]);


  return (<View style={styles.card}>
    <Text style={styles.cardTitle}>Define a Word</Text>
    {/* Word Input */}
    <View style={styles.inputGroup}>
      <Text style={styles.label}>Word / Phrase *</Text>
      <TextInput
        ref={wordInputRef}
        style={[styles.input, isLoading && styles.inputDisabled]}
        placeholder="e.g., Serendipity"
        value={word}
        onChangeText={setWord}
        returnKeyType="next"
        onSubmitEditing={() => lengthInputRef.current?.focus()}
        blurOnSubmit={false}
        editable={!isLoading}
        placeholderTextColor={COLORS.textSecondary}
      />
    </View>
    {/* Length Input */}
    <View style={styles.inputGroup}>
      <Text style={styles.label}>Target Length (Words) *</Text>
      <TextInput
        ref={lengthInputRef}
        style={[styles.input, isLoading && styles.inputDisabled]}
        placeholder={`Approx. ${MAX_REQUESTED_LENGTH} max`}
        value={length}
        onChangeText={setLength}
        keyboardType="number-pad"
        returnKeyType={showOptionalFilters ? "next" : "done"} // Change based on filter visibility
        onSubmitEditing={showOptionalFilters ? () => toneInputRef.current?.focus() : submitDefine}
        editable={!isLoading}
        placeholderTextColor={COLORS.textSecondary}
      />
    </View>
    {/* Optional Filters Toggle */}
    <TouchableOpacity
      style={styles.toggleButton}
      onPress={() => setShowOptionalFilters(prev => !prev)}
      activeOpacity={0.7}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} // Increase tap area
    >
      <Text style={styles.toggleButtonText}>{showOptionalFilters ? 'Hide' : 'Show'} Optional Filters</Text>
      <MaterialIcons name={showOptionalFilters ? 'expand-less' : 'expand-more'} size={24} color={COLORS.primary} />
    </TouchableOpacity>
    {/* Optional Filters Inputs (Animated would be smoother but adds complexity) */}
    {showOptionalFilters && (
      <View style={styles.optionalFiltersContainer} /* Replace Animated.View with View for simplicity unless animation is critical */>
        {/* Tone Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Tone (Optional)</Text>
          <TextInput
            ref={toneInputRef}
            style={[styles.input, isLoading && styles.inputDisabled]}
            placeholder="e.g., formal, humorous, simple"
            value={tone}
            onChangeText={setTone}
            returnKeyType="next"
            onSubmitEditing={() => contextInputRef.current?.focus()}
            blurOnSubmit={false}
            editable={!isLoading}
            placeholderTextColor={COLORS.textSecondary}
          />
        </View>
        {/* Context Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Context (Optional)</Text>
          <TextInput
            ref={contextInputRef}
            style={[styles.input, isLoading && styles.inputDisabled]}
            placeholder="e.g., medical, legal, for a child"
            value={contextValue}
            onChangeText={setContextValue}
            returnKeyType="next"
            onSubmitEditing={() => langInputRef.current?.focus()}
            blurOnSubmit={false}
            editable={!isLoading}
            placeholderTextColor={COLORS.textSecondary}
          />
        </View>
        {/* Language Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Language (Optional, ISO code)</Text>
          <TextInput
            ref={langInputRef}
            style={[styles.input, isLoading && styles.inputDisabled]}
            placeholder="e.g., eng, spa, fra (default: auto)"
            value={lang}
            onChangeText={setLang}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={submitDefine} // Submit on final field
            editable={!isLoading}
            placeholderTextColor={COLORS.textSecondary}
          />
        </View>
      </View>
    )}
    {/* Define Button */}
    <TouchableOpacity
      style={[styles.button, styles.buttonPrimary, (!canDefine || isLoading) && styles.buttonDisabled]}
      onPress={submitDefine}
      disabled={!canDefine || isLoading}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={canDefine && !isLoading ? [COLORS.primaryLight, COLORS.primary] : [COLORS.textDisabled, COLORS.textSecondary]}
        style={styles.buttonGradient}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        {isLoading
          ? <ActivityIndicator size="small" color={COLORS.surface} />
          : ( /* Ensure icon and text are inside Text and properly aligned */
            <Text style={styles.buttonText}>
              <MaterialIcons name="search" size={18} color={COLORS.surface} style={{ marginRight: 8 }} /> {/* Added style for spacing */}
              {buttonTextContent}
            </Text>
          )
        }
      </LinearGradient>
    </TouchableOpacity>
  </View>);
});

const DailyWordCard = React.memo(({ onDefinePress }) => (
  <View style={[styles.card, styles.dailyWordCard]}>
    <View style={styles.dailyWordHeader}>
      <MaterialIcons name="auto-stories" size={24} color={COLORS.accent} />
      <Text style={styles.dailyWordTitle}>Word of the Day</Text>
    </View>
    <Text style={styles.dailyWordWord}>Ephemeral</Text>
    <Text style={styles.dailyWordDefinition}>Lasting for a very short time; fleeting.</Text>
    <Text style={styles.dailyWordExample}>"The beauty of the cherry blossoms is ephemeral."</Text>
    <TouchableOpacity
      style={styles.dailyWordButton}
      onPress={() => onDefinePress("Ephemeral", 25, "formal")} // Example params
      activeOpacity={0.7}
    >
      <Text style={styles.dailyWordButtonText}>Define Ephemeral (25 words)</Text>
    </TouchableOpacity>
  </View>
));

const LoadingIndicator = React.memo(() => (
  <View style={styles.centeredMessage}>
    <ActivityIndicator size="large" color={COLORS.primary} />
    <Text style={styles.loadingText}>Loading Definition...</Text>
  </View>
));

const ErrorCard = React.memo(({ message, onRetry }) => (
  <View style={[styles.card, styles.errorCard]}>
    <MaterialIcons name="error-outline" size={48} color={COLORS.error} />
    <Text style={styles.errorTitle}>An Error Occurred</Text>
    <Text style={styles.errorMessage}>{message || 'Could not complete the request.'}</Text>
    {onRetry && (
      <TouchableOpacity
        style={[styles.button, styles.buttonSecondary]}
        onPress={onRetry}
        activeOpacity={0.7}
      >
        <Text style={styles.buttonTextSecondary}>Try Again</Text>
      </TouchableOpacity>
    )}
  </View>
));

const InfoChip = React.memo(({ icon, label, value, iconSet }) => {
  const IconComponent = iconSet || MaterialIcons;
  // Render if value is present (including 0, but not null/undefined/empty string)
  if (value === null || value === undefined || value === '') return null;

  return (
    <View style={styles.chip}>
      <IconComponent name={icon} size={16} color={COLORS.primaryDark} style={styles.chipIcon} />
      <Text style={styles.chipText} numberOfLines={1} ellipsizeMode="tail">
        <Text style={styles.chipLabel}>{label}: </Text>
        {/* Ensure value is string */}
        {String(value)}
      </Text>
    </View>
  );
});

const ActionButton = React.memo(({ icon, label, onPress, disabled = false, iconSet }) => {
  const IconComponent = iconSet || MaterialIcons;
  return (
    <TouchableOpacity
      style={[styles.actionButton, disabled && styles.actionButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }} // Increase tap area
    >
      <IconComponent
        name={icon}
        size={26} /* Slightly larger icon */
        color={disabled ? COLORS.textDisabled : COLORS.primary}
      />
      <Text style={[styles.actionButtonText, disabled && styles.actionButtonTextDisabled]}>{label}</Text>
    </TouchableOpacity>
  );
});


const DefinitionResult = React.memo(() => {
  const { definitionResult, clearSearch, addFavorite, removeFavorite, isFavorite, addToQuiz, showToast } = useContext(AppContext);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const [isSpeaking, setIsSpeaking] = useState(false); // Track TTS state

  // Destructure safely, providing defaults
  const {
    word = 'Word', // Default if definitionResult is null
    result = 'No definition available.',
    actualLength = 'N/A',
    status = 'N/A',
    config = {},
    cacheHit = false,
    requestedLength // Can be undefined if not set properly
  } = definitionResult || {};

  const isExact = status === "Exact length achieved";
  const effectiveLang = config?.effectiveLang || 'en'; // Default to 'en'
  const displayTone = config?.tone && config.tone !== 'neutral' ? config.tone : null;
  const displayContext = config?.context && config.context !== 'none' ? config.context : null;

  // More robust status display logic
  const statusDisplay = useMemo(() => {
    if (!status || status === 'N/A') return 'N/A';
    if (isExact) return 'Exact Length';
    // Try to extract reason more reliably
    if (status.includes('Closest possible length achieved')) return 'Closest Possible';
    if (status.includes('Could not meet constraint')) return 'Constraint Issue';
    // Fallback to simpler extraction if needed
    const match = status.match(/\(([^)]+)\)/);
    return match ? match[1].replace('Closest: ', '').replace('Difference: ', 'Diff: ') : status;
  }, [status, isExact]);

  // Ensure requestedLength is displayable
  const displayRequestedLength = requestedLength ?? definitionResult?.length ?? 'N/A';

  useEffect(() => {
    let speakStartSub, speakDoneSub, speakStoppedSub, speakErrorSub;
    const setupSpeechListeners = () => {
      speakStartSub = Speech.addListener('Expo.Speech.onStart', () => setIsSpeaking(true));
      speakDoneSub = Speech.addListener('Expo.Speech.onDone', () => setIsSpeaking(false));
      speakStoppedSub = Speech.addListener('Expo.Speech.onStopped', () => setIsSpeaking(false));
      speakErrorSub = Speech.addListener('Expo.Speech.onError', (error) => {
        console.error("TTS Playback Error Event:", error);
        // Don't necessarily show a toast here as onError in speak() already does
        setIsSpeaking(false);
      });
    };
    const removeSpeechListeners = () => {
      speakStartSub?.remove();
      speakDoneSub?.remove();
      speakStoppedSub?.remove();
      speakErrorSub?.remove();
    };

    if (definitionResult) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true })
      ]).start();

      // Check current speaking state and set up listeners
      Speech.isSpeakingAsync().then(speaking => {
        setIsSpeaking(speaking)
        // Setup listeners regardless of initial state, as user might interact later
        setupSpeechListeners();
      }).catch(e => console.warn("Error checking speech status:", e));

    } else {
      // Reset animation values if definitionResult becomes null
      fadeAnim.setValue(0);
      slideAnim.setValue(20);
      setIsSpeaking(false); // Reset speaking state
    }

    // Cleanup function
    return () => {
      removeSpeechListeners();
      // Attempt to stop speech only if it was potentially playing for this component instance
      Speech.isSpeakingAsync().then(speaking => {
        if (speaking) {
          Speech.stop().catch(e => console.warn("Speech stop failed on cleanup:", e));
        }
      }).catch(e => console.warn("Error checking speech status on cleanup:", e));
    };
    // Rerun effect if definitionResult changes
  }, [definitionResult, fadeAnim, slideAnim]);


  if (!definitionResult) return null; // Guard clause

  const wordIsFavorite = isFavorite(word);

  const handleListen = async () => {
    if (!result || result === 'No definition available.') {
      showToast('No definition text to read.', 'info');
      return;
    }

    try {
      const currentlySpeaking = await Speech.isSpeakingAsync();
      if (currentlySpeaking) {
        await Speech.stop();
        setIsSpeaking(false); // State might be updated by listener, but set explicitly too
      } else {
        // Filter for voices matching the *start* of the language code (e.g., 'en' matches 'en-US', 'en-GB')
        const availableVoices = await Speech.getAvailableVoicesAsync();
        const voice = availableVoices.find(v => v.language.startsWith(effectiveLang));

        Speech.speak(result, {
          language: effectiveLang,
          voice: voice?.identifier, // Use specific voice if found
          onStart: () => setIsSpeaking(true), // Primarily rely on listeners setup in useEffect
          onDone: () => setIsSpeaking(false),
          onStopped: () => setIsSpeaking(false),
          onError: (e) => {
            console.error("TTS Speak Error Callback:", e);
            showToast('Text-to-speech playback failed.', 'error');
            setIsSpeaking(false); // Reset state on error
          }
        });
      }
    } catch (e) {
      console.error("TTS Interaction Error:", e);
      showToast('Text-to-speech feature encountered an error.', 'error');
      setIsSpeaking(false); // Ensure state is reset
    }
  };

  const handleCopy = async () => {
    if (result && result !== 'No definition available.') {
      await Clipboard.setStringAsync(result);
      showToast('Definition Copied!', 'success');
    } else {
      showToast('No definition text to copy.', 'info');
    }
  };

  const handleShare = useCallback(async () => {
    if (!result || !word || result === 'No definition available.') {
      showToast('No definition available to share.', 'info');
      return;
    }
    const shareText = `Definition for "${word}":\n${result}\n\n(From VocabMaster Pro v${APP_VERSION})`;

    // Use Expo Sharing module for a native share sheet if available
    // Fallback to mailto: link
    try {
      // Import Sharing at the top: import * as Sharing from 'expo-sharing';
      // await Sharing.shareAsync(shareText, {
      //     dialogTitle: `Share definition for ${word}`, // Optional
      //     mimeType: 'text/plain' // Optional
      // });
      // --- Using mailto: as fallback or if Sharing isn't imported ---
      const url = `mailto:?subject=Definition: ${word}&body=${encodeURIComponent(shareText)}`;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        // If mailto fails, try copying as a last resort
        console.warn("Cannot open mailto link.");
        await Clipboard.setStringAsync(shareText);
        showToast('Sharing via email not available. Definition copied instead.', 'info');
      }
    } catch (error) {
      console.error("Share error:", error);
      await Clipboard.setStringAsync(shareText); // Fallback to copy
      showToast(`Sharing failed: ${error.message || 'Unknown error'}. Definition copied instead.`, 'error');
    }
  }, [word, result, showToast]); // Dependencies are correct

  const handleQuizIt = () => addToQuiz(word);
  const toggleFavorite = () => wordIsFavorite ? removeFavorite(word) : addFavorite(word);

  return (
    <Animated.View style={[styles.card, styles.resultCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      {/* Header: Word and Bookmark */}
      <View style={styles.resultHeader}>
        <Text style={styles.resultWord}>{word}</Text>
        <TouchableOpacity onPress={toggleFavorite} style={styles.bookmarkIcon} activeOpacity={0.6} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons
            name={wordIsFavorite ? "bookmark" : "bookmark-border"}
            size={32}
            color={wordIsFavorite ? COLORS.primaryDark : COLORS.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Chips: Metadata */}
      <View style={styles.chipContainer}>
        <InfoChip icon={isExact ? "check-circle-outline" : "rule"} label="Length" value={`${actualLength} words (Req: ${displayRequestedLength})`} />
        <InfoChip icon="flag" label="Status" value={statusDisplay} />
        <InfoChip icon="language" label="Lang" value={effectiveLang || 'N/A'} />
        {cacheHit && <InfoChip icon="cached" label="Source" value="Cache" />}
        {/* Conditionally render Tone and Context chips only if they have a value */}
        {displayTone && <InfoChip icon="sentiment-satisfied-alt" label="Tone" value={displayTone} />}
        {displayContext && <InfoChip icon="gavel" label="Context" value={displayContext} />}
      </View>

      {/* Definition Box */}
      <View style={styles.definitionBox}>
        {/* ScrollView is good for potentially long definitions */}
        <ScrollView nestedScrollEnabled={true} showsVerticalScrollIndicator={false}>
          <Text style={styles.definitionText} selectable={true}>{/* Ensure text is selectable */}
            {String(result)} {/* Ensure result is treated as string */}
          </Text>
        </ScrollView>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtonsContainer}>
        <ActionButton icon={isSpeaking ? "stop-circle" : "volume-up"} label={isSpeaking ? "Stop" : "Listen"} onPress={handleListen} disabled={result === 'No definition available.'} />
        <ActionButton icon="content-copy" label="Copy" onPress={handleCopy} disabled={result === 'No definition available.'} />
        <ActionButton icon="share" label="Share" onPress={handleShare} disabled={result === 'No definition available.'} />
        <ActionButton icon="school" label="Quiz It" onPress={handleQuizIt} iconSet={MaterialIcons} />
      </View>

      {/* Clear Button */}
      <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={clearSearch} activeOpacity={0.7}>
        <Text style={styles.buttonTextSecondary}>Define Another Word</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});


const WordListItem = React.memo(({ item, onPress, onRemove, type }) => {
  const isHistory = type === 'history';
  // Safely access potentially nested properties, provide defaults
  const displayWord = String(item?.word || 'Unknown Word');
  const displayLength = item?.length ?? '?'; // Requested length from history item
  const displayActualLength = item?.result?.actualLength;
  const displayLang = item?.lang ?? item?.result?.effectiveLang; // Lang used for request or result
  const displayTone = item?.tone;
  const displayContext = item?.context;
  const hasOptionalParams = (displayTone && displayTone !== 'neutral') || (displayContext && displayContext !== 'none');

  const iconName = isHistory ? "history" : "star"; // Use filled star for favorites

  return (
    <TouchableOpacity style={styles.listItemCard} onPress={onPress} activeOpacity={0.7}>
      {/* Icon */}
      <MaterialIcons name={iconName} size={24} color={isHistory ? COLORS.textSecondary : COLORS.accent} style={styles.listItemIcon} />
      {/* Content */}
      <View style={styles.listItemContent}>
        <Text style={styles.listItemWord} numberOfLines={1} ellipsizeMode="tail">{displayWord}</Text>
        {/* Show metadata only for history items */}
        {isHistory && (
          <View style={styles.historyMetaContainer}>
            <Text style={styles.historyMetaText} numberOfLines={1} ellipsizeMode="tail">
              {`Req: ${displayLength}w`}
              {/* Only show actual length if available and different from requested */}
              {(displayActualLength && displayActualLength !== displayLength) ? `, Gen: ${displayActualLength}w` : ''}
              {displayLang ? ` (${displayLang})` : ''}
            </Text>
            {/* Show Tone/Context only if they were used */}
            {hasOptionalParams && (
              <Text style={styles.historyMetaTextSmall} numberOfLines={1} ellipsizeMode="tail">
                {displayTone && displayTone !== 'neutral' ? `Tone: ${displayTone} ` : ''}
                {displayContext && displayContext !== 'none' ? `Ctx: ${displayContext}` : ''}
              </Text>
            )}
          </View>
        )}
      </View>
      {/* Remove Button (Only for favorites, or potentially quiz items if needed) */}
      {/* Check explicitly for 'favorite' type and ensure onRemove is a function */}
      {type === 'favorite' && typeof onRemove === 'function' && (
        <TouchableOpacity onPress={onRemove} style={styles.removeButton} activeOpacity={0.6} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons name="close" size={24} color={COLORS.error} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

const QuizItem = React.memo(({ item, onRemove }) => {
  // TODO: Implement definition fetching/display for Quiz items.
  // This requires fetching the definition when expanded, potentially using handleDefine or getCachedDefinition from context.
  const { getCachedDefinition, handleDefine, showToast } = useContext(AppContext); // Access context for fetching
  const [showDefinition, setShowDefinition] = useState(false);
  const [isLoadingDef, setIsLoadingDef] = useState(false);
  const [definitionText, setDefinitionText] = useState(null); // Store fetched definition

  const displayWord = String(item?.word || 'Unknown Word');

  // Function to fetch or load definition
  const loadDefinition = useCallback(async () => {
    if (!displayWord || displayWord === 'Unknown Word') return;

    setIsLoadingDef(true);
    setDefinitionText(null); // Clear previous text

    // Try cache first (using default parameters, maybe store params with quiz item?)
    const params = { word: displayWord, length: 30 }; // Assume default length for quiz lookup
    let def = await getCachedDefinition(params);

    if (def) {
      setDefinitionText(def.result);
    } else {
      // If not in cache, fetch (this might take time and incur cost)
      // Consider if we *want* to fetch on demand in quiz list, or only show cached?
      // For now, let's just show a message if not cached.
      // await handleDefine(params); // This would trigger a full fetch and update App state
      setDefinitionText('Definition not found in local cache. Define it again to view here.');
      // Alternative: Trigger a silent fetch?
      // showToast(`Fetching definition for ${displayWord}...`, 'info');
      // Needs more robust handling if live fetching is desired here.
    }

    setIsLoadingDef(false);
  }, [displayWord, getCachedDefinition, showToast]); // handleDefine removed to avoid full state update

  const toggleDefinition = () => {
    const newState = !showDefinition;
    setShowDefinition(newState);
    // Load definition only when expanding and if not already loaded/loading
    if (newState && !definitionText && !isLoadingDef) {
      loadDefinition();
    }
  };

  // Render definition content based on state
  const definitionContent = useMemo(() => {
    if (!showDefinition) return null;

    return (
      <View style={styles.quizDefinitionContainer}>
        {isLoadingDef ? (
          <>
            <ActivityIndicator size="small" color={COLORS.quizAccent} />
            <Text style={styles.quizDefinitionPlaceholder}>Loading definition...</Text>
          </>
        ) : (
          // Display fetched text or placeholder message
          <Text style={styles.quizDefinitionText}>
            {definitionText || 'Tap again to load definition.'}
          </Text>
        )}
      </View>
    );
  }, [showDefinition, isLoadingDef, definitionText]);

  return (
    <View style={[styles.listItemCard, styles.quizItemCard, showDefinition && styles.quizItemCardExpanded]}>
      {/* Word and Definition Area */}
      <View style={styles.listItemContent}>
        <Text style={styles.listItemWord}>{displayWord}</Text>
        {definitionContent}
      </View>
      {/* Action Buttons */}
      <View style={styles.quizItemActions}>
        <TouchableOpacity onPress={toggleDefinition} style={styles.quizToggleButton} activeOpacity={0.6} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons name={showDefinition ? "expand-less" : "expand-more"} size={28} color={COLORS.quizAccent} />
        </TouchableOpacity>
        {/* Ensure onRemove is callable */}
        {typeof onRemove === 'function' && (
          <TouchableOpacity onPress={onRemove} style={styles.removeButton} activeOpacity={0.6} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialIcons name="delete-outline" size={24} color={COLORS.error} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

const EmptyState = React.memo(({ icon, title, message, buttonText, onButtonPress, iconSet }) => {
  const IconComponent = iconSet || MaterialIcons;
  return (
    <View style={styles.emptyStateContainer}>
      <IconComponent name={icon || "info-outline"} size={72} color={COLORS.textSecondary} style={styles.emptyStateIcon} />
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateMessage}>{message}</Text>
      {buttonText && typeof onButtonPress === 'function' && (
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary, styles.emptyStateButton]}
          onPress={onButtonPress}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonTextSecondary}>{buttonText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

const RecentSearchesContainer = React.memo(() => {
  const { sortedHistory, handleDefine } = useContext(AppContext);
  // No need for navigation/setters if handleDefine is used directly
  // const navigation = useNavigation();

  // Get top 5 recent history items
  const recentHistory = useMemo(() => sortedHistory.slice(0, 5), [sortedHistory]);

  // Return null if no history
  if (!recentHistory || recentHistory.length === 0) {
    return null;
  }

  // Handle pressing a recent item - directly triggers define
  const handlePress = useCallback((item) => {
    if (!item || !item.word) return;
    // Call handleDefine with the parameters from the history item
    handleDefine({
      word: item.word,
      length: item.length || 30, // Use history length or default
      tone: item.tone, // Pass along tone/context/lang if they exist
      context: item.context,
      lang: item.lang
    });
    // No navigation needed, handleDefine updates the main screen state
    // navigation.navigate('Define'); // Avoid navigating, let DefineScreen update
  }, [handleDefine]); // Dependency on handleDefine

  return (
    <View style={[styles.card, styles.recentSearchesCard]}>
      <Text style={styles.cardTitle}>Recent Searches</Text>
      {recentHistory.map((item) => (
        <TouchableOpacity
          key={item.timestamp || item.word} // Use timestamp for key
          style={styles.recentSearchItem}
          onPress={() => handlePress(item)}
          activeOpacity={0.7}
        >
          <MaterialIcons name="history" size={18} color={COLORS.textSecondary} style={{ marginRight: 10 }} />
          {/* Ensure text is nested correctly */}
          <Text style={styles.recentSearchText} numberOfLines={1} ellipsizeMode="tail">
            {item.word}
            <Text style={styles.recentSearchMeta}>
              {' '} {/* Space */}
              ({item.length || '?'}w{item.lang ? `, ${item.lang}` : ''})
            </Text>
          </Text>
          <MaterialIcons name="chevron-right" size={24} color={COLORS.textSecondary} />
        </TouchableOpacity>
      ))}
    </View>
  );
});

const ListSorter = React.memo(({ sortOrder, setSortOrder, options }) => {
  if (!options || options.length === 0) return null; // Don't render if no options

  return (
    <View style={styles.sorterContainer}>
      <Text style={styles.sorterLabel}>Sort by:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorterOptionsContainer}>
        {options.map(option => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.sorterButton,
              sortOrder === option.value && styles.sorterButtonActive
            ]}
            onPress={() => setSortOrder(option.value)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.sorterButtonText,
              sortOrder === option.value && styles.sorterButtonTextActive
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});


// --- Screen Components ---

function DefineScreen({ navigation }) { // navigation prop is implicitly passed by React Navigation
  const {
    isLoading, error, definitionResult, clearSearch, handleDefine, word,
    sortedHistory, isInitialDataLoaded, setWord, setLength, setTone, setContextValue, setLang
  } = useContext(AppContext);

  // Determine visibility based on state
  const showLoading = isLoading;
  const showError = !isLoading && error;
  const showResult = !isLoading && !error && definitionResult;
  const showFormArea = !isLoading && !error && !definitionResult;
  // Show recent searches if the form area is visible, history exists, and search input is empty
  const showRecentSearches = showFormArea && sortedHistory.length > 0 && (word || '').trim() === '';

  // Handler for defining the Word of the Day
  const handleDefineWOTD = useCallback((wotd, length, tone) => {
    // Set form fields
    setWord(wotd);
    setLength(String(length));
    setTone(tone || '');
    setContextValue(''); // Reset context/lang for WOTD
    setLang('');
    // Directly trigger the define action
    handleDefine({ word: wotd, length: length, tone: tone });
  }, [setWord, setLength, setTone, setContextValue, setLang, handleDefine]); // Dependencies are correct

  // Show initial loading indicator until context confirms data is loaded
  if (!isInitialDataLoaded) {
    return <SafeAreaView style={styles.screenSafeArea} edges={['right', 'bottom', 'left']}><LoadingIndicator /></SafeAreaView>;
  }

  return (
    // Use SafeAreaView edges to control padding relative to safe areas, avoiding the top edge handled by Header
    <SafeAreaView style={styles.screenSafeArea} edges={['right', 'bottom', 'left']}>
      <ScrollView
        style={styles.screenScroll}
        contentContainerStyle={styles.screenContentContainer}
        keyboardShouldPersistTaps="handled" // Dismiss keyboard on tap outside inputs
        showsVerticalScrollIndicator={false}
      // Add scroll-to-top functionality? (Requires ref)
      >
        {/* Conditional Rendering Logic */}
        {showLoading && <LoadingIndicator />}

        {showError && <ErrorCard message={error} onRetry={clearSearch} />}

        {showResult && <DefinitionResult />}

        {/* Container for Form/WOTD/Recents - shown when no result/error/loading */}
        {showFormArea && (
          <>
            {/* Show Recents first if available and search is empty */}
            {showRecentSearches && <RecentSearchesContainer />}
            {/* Show Word of the Day */}
            <DailyWordCard onDefinePress={handleDefineWOTD} />
            {/* Show the Search Form */}
            <SearchForm />
            {/* Recent searches could also be placed below the form */}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};


function FavoritesScreen({ navigation }) {
  const {
    sortedFavorites, removeFavorite, handleDefine, // Use handleDefine directly
    isInitialDataLoaded, favSortOrder, setFavSortOrder, showToast
  } = useContext(AppContext);

  // Define sorting options
  const sortOptions = useMemo(() => [
    { label: 'Newest', value: 'newest' },
    { label: 'Oldest', value: 'oldest' },
    { label: 'A-Z', value: 'a-z' },
    { label: 'Z-A', value: 'z-a' }
  ], []);

  // Handler for pressing a favorite item
  const handleFavoritePress = useCallback((item) => {
    if (!item || !item.word) return;
    // Directly trigger define with the favorited word and default parameters
    // If history lookup is needed for specific params, that's more complex
    showToast(`Defining "${item.word}"...`, 'info'); // Give feedback
    handleDefine({ word: item.word, length: 30 }); // Use default length/params
    // Navigate back to Define tab after triggering definition
    navigation.navigate('Define');
  }, [handleDefine, navigation, showToast]); // Dependencies

  // Handler for removing a favorite
  const handleRemoveFavorite = useCallback((wordToRemove) => {
    // Optional: Confirmation Alert
    Alert.alert(
      "Remove Favorite",
      `Are you sure you want to remove "${wordToRemove}" from your favorites?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", onPress: () => removeFavorite(wordToRemove), style: "destructive" }
      ]
    );
  }, [removeFavorite]);

  // Render item function for FlatList
  const renderFavoriteItem = useCallback(({ item }) => (
    <WordListItem
      item={item}
      onPress={() => handleFavoritePress(item)}
      onRemove={() => handleRemoveFavorite(item.word)}
      type="favorite"
    />
  ), [handleFavoritePress, handleRemoveFavorite]);

  if (!isInitialDataLoaded) {
    return <SafeAreaView style={styles.screenSafeArea} edges={['right', 'bottom', 'left']}><LoadingIndicator /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.screenSafeArea} edges={['right', 'bottom', 'left']}>
      <View style={styles.screenContainer}>
        {sortedFavorites.length === 0 ? (
          <EmptyState
            icon="favorite-border"
            title="No Favorites Yet"
            message="Use the bookmark icon on a definition result to save words here."
            buttonText="Define a Word"
            onButtonPress={() => navigation.navigate('Define')}
          />
        ) : (
          <>
            <Text style={styles.listScreenTitle}>My Favorites ({sortedFavorites.length})</Text>
            <ListSorter sortOrder={favSortOrder} setSortOrder={setFavSortOrder} options={sortOptions} />
            <FlatList
              data={sortedFavorites}
              renderItem={renderFavoriteItem}
              keyExtractor={(item) => item.word + (item.timestamp || '')} // Combine word and timestamp for key
              style={styles.listStyle}
              contentContainerStyle={styles.listContentContainer}
              showsVerticalScrollIndicator={false}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
};


function HistoryScreen({ navigation }) {
  const {
    sortedHistory, clearHistory, handleDefine, // Use handleDefine directly
    isInitialDataLoaded, histSortOrder, setHistSortOrder, showToast
  } = useContext(AppContext);

  // Define sorting options
  const sortOptions = useMemo(() => [
    { label: 'Newest', value: 'newest' },
    { label: 'Oldest', value: 'oldest' },
    { label: 'A-Z', value: 'a-z' },
    { label: 'Z-A', value: 'z-a' }
  ], []);

  // Handler for pressing a history item
  const handleHistoryPress = useCallback((item) => {
    if (!item || !item.word) return;
    showToast(`Defining "${item.word}"...`, 'info'); // Give feedback
    // Directly trigger define with the parameters stored in the history item
    handleDefine({
      word: item.word,
      length: item.length || 30, // Use stored length or default
      tone: item.tone,          // Use stored tone or undefined
      context: item.context,      // Use stored context or undefined
      lang: item.lang           // Use stored lang or undefined
    });
    // Navigate back to Define tab after triggering definition
    navigation.navigate('Define');
  }, [handleDefine, navigation, showToast]); // Dependencies

  // Render item function for FlatList
  // Pass null for onRemove as history items aren't individually removable here
  const renderHistoryItem = useCallback(({ item }) => (
    <WordListItem
      item={item}
      onPress={() => handleHistoryPress(item)}
      onRemove={null}
      type="history"
    />
  ), [handleHistoryPress]);

  if (!isInitialDataLoaded) {
    return <SafeAreaView style={styles.screenSafeArea} edges={['right', 'bottom', 'left']}><LoadingIndicator /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.screenSafeArea} edges={['right', 'bottom', 'left']}>
      <View style={styles.screenContainer}>
        {sortedHistory.length === 0 ? (
          <EmptyState
            icon="history"
            title="No Search History"
            message="Words you define will appear here for quick access to their definitions and parameters."
            buttonText="Define a Word"
            onButtonPress={() => navigation.navigate('Define')}
          />
        ) : (
          <>
            {/* Header with Title and Clear Button */}
            <View style={styles.listHeader}>
              <Text style={styles.listScreenTitle}>Search History ({sortedHistory.length})</Text>
              {/* Ensure clearHistory is only callable */}
              {typeof clearHistory === 'function' && (
                <TouchableOpacity onPress={clearHistory} style={styles.clearButton} activeOpacity={0.7}>
                  <MaterialIcons name="delete-sweep" size={22} color={COLORS.error} />
                  <Text style={styles.clearButtonText}>Clear All</Text>
                </TouchableOpacity>
              )}
            </View>
            {/* Sorter */}
            <ListSorter sortOrder={histSortOrder} setSortOrder={setHistSortOrder} options={sortOptions} />
            {/* List */}
            <FlatList
              data={sortedHistory}
              renderItem={renderHistoryItem}
              // Use timestamp + word as key for better uniqueness in case of rapid searches
              keyExtractor={(item, index) => `${item.timestamp || index}-${item.word}`}
              style={styles.listStyle}
              contentContainerStyle={styles.listContentContainer}
              showsVerticalScrollIndicator={false}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
};


function QuizScreen({ navigation }) {
  const { quizList, removeFromQuiz, isInitialDataLoaded, showToast } = useContext(AppContext);

  // Handler for removing a quiz item
  const handleRemoveQuizItem = useCallback((idToRemove) => {
    // Optional: Add confirmation
    Alert.alert(
      "Remove Quiz Word",
      "Are you sure you want to remove this word from your quiz list?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", onPress: () => removeFromQuiz(idToRemove), style: "destructive" }
      ]
    );
    // removeFromQuiz(idToRemove); // Call directly if no confirmation needed
  }, [removeFromQuiz]);

  // Render item function for FlatList
  const renderQuizItem = useCallback(({ item }) => (
    <QuizItem
      item={item}
      onRemove={() => handleRemoveQuizItem(item.id)}
    />
  ), [handleRemoveQuizItem]); // Dependency

  // Handler for starting the quiz (placeholder)
  const handleStartQuiz = useCallback(() => {
    if (quizList.length > 0) {
      showToast("Quiz feature coming soon!", 'info');
      // TODO: Navigate to the actual quiz gameplay screen
      // navigation.navigate('QuizGame', { wordList: quizList });
    } else {
      showToast("Add words to your list using the 'Quiz It' button before starting.", 'info');
    }
  }, [quizList, showToast, navigation]); // Add navigation if used for QuizGame

  if (!isInitialDataLoaded) {
    return <SafeAreaView style={styles.screenSafeArea} edges={['right', 'bottom', 'left']}><LoadingIndicator /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.screenSafeArea} edges={['right', 'bottom', 'left']}>
      <View style={styles.screenContainer}>
        {quizList.length === 0 ? (
          <EmptyState
            icon="school" // MaterialIcons is default
            title="Quiz List is Empty"
            message="Use the 'Quiz It' button on a definition result to add words for review."
            buttonText="Define a Word"
            onButtonPress={() => navigation.navigate('Define')}
          />
        ) : (
          <>
            <Text style={styles.listScreenTitle}>My Quiz Words ({quizList.length})</Text>
            {/* Start Quiz Button */}
            <TouchableOpacity
              style={[
                styles.button,
                styles.buttonPrimary, // Use primary button style or a dedicated quiz style
                styles.startQuizButton // Specific margins for this button
              ]}
              onPress={handleStartQuiz}
              activeOpacity={0.8}
            >
              <LinearGradient
                // Use quiz accent or primary colors
                colors={[COLORS.quizAccent, COLORS.primaryLight]}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              >
                <Text style={styles.buttonText}>
                  <MaterialIcons name="play-circle-outline" size={20} color={COLORS.surface} style={{ marginRight: 8 }} />
                  Start Quiz ({quizList.length})
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            {/* List of Quiz Words */}
            <FlatList
              data={quizList}
              renderItem={renderQuizItem}
              keyExtractor={item => item.id} // Use unique ID from context
              style={styles.listStyle}
              contentContainerStyle={styles.listContentContainer}
              showsVerticalScrollIndicator={false}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
};


function SettingsScreen({ navigation }) {
  const { clearCache, clearHistory } = useContext(AppContext); // Get actions from context

  // Use useCallback to ensure function identity is stable, useful if passed as props, good practice regardless
  const handleClearCache = useCallback(() => {
    Alert.alert(
      "Clear Definition Cache",
      "Are you sure you want to delete all locally saved definitions? This can free up space but definitions will need to be fetched again. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear Cache", onPress: clearCache, style: "destructive" } // Use the clearCache action from context
      ]
    );
  }, [clearCache]); // Dependency: clearCache action

  // clearHistory from context already uses useCallback, so just assign it
  const handleClearHistory = useCallback(() => {
    // Alert confirmation is already handled within the clearHistory function in context
    clearHistory();
  }, [clearHistory]);

  // Example handler for linking
  const openLink = async (url) => {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert("Cannot Open Link", `Could not open the URL: ${url}`);
    }
  };

  return (
    // Use SafeAreaView to avoid notch/status bar/bottom home indicator overlaps
    <SafeAreaView style={styles.screenSafeArea} edges={['right', 'bottom', 'left']}>
      <ScrollView
        style={styles.settingsScrollContainer}
        contentContainerStyle={styles.settingsContentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* --- Data Management Section --- */}
        <Text style={styles.settingsSectionTitle}>Data Management</Text>
        <View style={styles.card}>
          {/* Clear Cache Item */}
          <TouchableOpacity style={styles.settingsItem} onPress={handleClearCache} activeOpacity={0.7}>
            <MaterialIcons name="delete-forever" size={24} color={COLORS.error} style={styles.settingsIconStyle} />
            <View style={styles.settingsItemContent}>
              <Text style={styles.settingsItemText}>Clear Definition Cache</Text>
              <Text style={styles.settingsItemDescription}>Removes definitions stored locally. Frees up space.</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={styles.settingsDivider} />

          {/* Clear History Item */}
          <TouchableOpacity style={styles.settingsItem} onPress={handleClearHistory} activeOpacity={0.7}>
            <MaterialIcons name="delete-sweep" size={24} color={COLORS.error} style={styles.settingsIconStyle} />
            <View style={styles.settingsItemContent}>
              <Text style={styles.settingsItemText}>Clear Search History</Text>
              <Text style={styles.settingsItemDescription}>Removes the list of past searches from the History tab.</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* --- About Section --- */}
        <Text style={styles.settingsSectionTitle}>About</Text>
        <View style={styles.card}>
          {/* App Version Item - Not Touchable */}
          <View style={[styles.settingsItem, styles.settingsItemNoBorder]}>
            <MaterialIcons name="info-outline" size={24} color={COLORS.primary} style={styles.settingsIconStyle} />
            <View style={styles.settingsItemContent}>
              <Text style={styles.settingsItemText}>App Version</Text>
            </View>
            <Text style={styles.settingsItemValue}>{APP_VERSION}</Text>
          </View>
        </View>

        {/* --- Legal/Links Section (Example) --- */}
        {/*
        <Text style={styles.settingsSectionTitle}>Legal</Text>
        <View style={styles.card}>
            <TouchableOpacity
                style={[styles.settingsItem, styles.settingsItemNoBorder]}
                onPress={() => openLink('https://your-privacy-policy-url.com')} // Replace with actual URL
                activeOpacity={0.7}
            >
                <MaterialIcons name="privacy-tip" size={24} color={COLORS.info} style={styles.settingsIconStyle} />
                <View style={styles.settingsItemContent}>
                    <Text style={styles.settingsItemText}>Privacy Policy</Text>
                </View>
                <MaterialIcons name="launch" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
        </View>
        */}

      </ScrollView>
    </SafeAreaView>
  );
}


// --- Custom Bottom Tab Bar Component ---
const CustomBottomTabBar = ({ state, descriptors, navigation }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[
      styles.customTabBarContainer,
      // Adjust paddingBottom based on safe area insets
      { paddingBottom: insets.bottom > 0 ? insets.bottom : 10 } // Provide minimum padding even without inset
    ]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel ?? options.title ?? route.name;
        const isFocused = state.index === index;

        // Determine icon based on route name and focus state
        let iconName;
        let IconComponent = MaterialIcons; // Default Icon set
        if (route.name === 'Define') {
          iconName = isFocused ? 'search' : 'search'; // Consistent icon
        } else if (route.name === 'Favorites') {
          iconName = isFocused ? 'favorite' : 'favorite-border'; // Filled/outline
        } else if (route.name === 'History') {
          iconName = isFocused ? 'history' : 'history'; // Consistent icon
        } else if (route.name === 'Quiz') {
          iconName = isFocused ? 'school' : 'school'; // Consistent icon
          IconComponent = MaterialIcons; // Ensure MaterialIcons
        } else {
          iconName = 'help-outline'; // Fallback icon
        }

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            // Use navigate for standard tab switching
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
          // Optional: Add custom long-press actions like resetting stack or scrolling to top
          // Example: Reset Define stack on long press
          // if (route.name === 'Define') {
          //   navigation.reset({ index: 0, routes: [{ name: route.name }] });
          // }
        };

        const accessibilityLabel = options.tabBarAccessibilityLabel ?? `${label} tab`;

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={accessibilityLabel}
            testID={options.tabBarTestID}
            onPress={onPress}
            onLongPress={onLongPress}
            style={[styles.customTabItem, isFocused ? styles.customTabItemFocused : null]}
            activeOpacity={0.8} // Consistent feedback
          >
            <IconComponent
              name={iconName}
              size={isFocused ? 28 : 26} /* Slightly larger when focused */
              color={isFocused ? COLORS.tabBarActiveTint : COLORS.tabBarInactiveTint}
            />
            <Text
              style={[styles.customTabLabel, { color: isFocused ? COLORS.tabBarActiveTint : COLORS.tabBarInactiveTint }]}
              numberOfLines={1} // Prevent label wrapping
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// --- Navigation Setup ---
const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

// Tab Navigator using the Custom Bar & Shared Header
function AppTabs() {
  return (
    <Tab.Navigator
      tabBar={props => <CustomBottomTabBar {...props} />} // Use custom tab bar component
      screenOptions={{
        // Use the *same* custom header component instance for all tab screens.
        // The Header component itself reads route/options/navigation state to display correctly.
        header: (props) => <Header {...props} />,
        // Ensure the header is shown (it's rendered by the function above)
        headerShown: true,
      }}
    >
      {/* Define Screens - Options like title are used by the Header component */}
      <Tab.Screen name="Define" component={DefineScreen} options={{ title: 'Define Word' }} />
      <Tab.Screen name="Favorites" component={FavoritesScreen} options={{ title: 'Favorites' }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
      <Tab.Screen name="Quiz" component={QuizScreen} options={{ title: 'Quiz List' }} />
    </Tab.Navigator>
  );
}

// Root Stack Navigator (Handles Tabs + Modals like Settings)
function RootNavigator() {
  return (
    <RootStack.Navigator
      screenOptions={{
        // Use the custom Header component for stack screens by default (including modals)
        header: (props) => <Header {...props} />,
      }}
    >
      {/* Main Tab Navigator Screen - Hide its *own* header because the tabs *within* it have headers */}
      <RootStack.Screen
        name="AppTabs"
        component={AppTabs}
        options={{ headerShown: false }} // Important: Hides the stack header for the tab container itself
      />
      {/* Modal Screen for Settings */}
      <RootStack.Screen
        name="SettingsModal"
        component={SettingsScreen}
        options={{
          presentation: 'modal', // iOS style slide-up, Android standard screen transition
          title: 'Settings',     // Title used by the custom Header component
          // No need for headerLeft/Right overrides unless custom behavior needed for modal specifically
        }}
      />
      {/* Add other stack screens outside the tabs here if needed */}
      {/* Example:
      <RootStack.Screen
        name="QuizGame"
        component={QuizGameScreen} // Assuming QuizGameScreen is defined
        options={{ title: 'Quiz Time!' }}
      />
      */}
    </RootStack.Navigator>
  );
}

// --- Main App Component ---
export default function App() {
  return (
    <SafeAreaProvider>
      {/* Set status bar style globally for consistency */}
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <AppProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
}

// --- Styles ---
// V2.2.1 - Polished Styles (Incorporating previous version's good choices and refining)
const styles = StyleSheet.create({
  // --- Screen & Layout ---
  screenSafeArea: {
    flex: 1,
    backgroundColor: COLORS.background // Ensure safe area has background color
  },
  screenScroll: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  screenContentContainer: {
    padding: 16,
    paddingBottom: 40 // Ensure content doesn't hide behind elements at the bottom
  },
  screenContainer: { // Used for non-scrolling screens or fixed content areas
    flex: 1,
    padding: 16,
    backgroundColor: COLORS.background
  },
  listScreenTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 16,
    marginLeft: 4 // Slight indent
  },

  // --- Header ---
  header: {
    paddingBottom: 15,
    paddingHorizontal: 5, // Reduced horizontal padding to allow buttons more space near edge
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 0, // Gradient provides visual separation
    backgroundColor: COLORS.primary, // Fallback bg
    // Standard elevation/shadow for Android/iOS
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerButtonContainer: { // Ensure consistent width for layout balance
    minWidth: 50, // Minimum width to balance title
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5, // Padding within the container
  },
  headerButton: {
    padding: 10, // Generous tap target
    borderRadius: 22, // Circular background on press (optional)
  },
  headerTitleContainer: {
    flex: 1, // Take available space
    alignItems: 'center', // Center title horizontally
    paddingHorizontal: 5, // Prevent title hitting buttons directly
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600', // Semi-bold
    color: COLORS.surface,
    textAlign: 'center',
  },

  // --- Custom Tab Bar ---
  customTabBarContainer: {
    flexDirection: 'row',
    height: 65, // Consistent height
    backgroundColor: COLORS.tabBarBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    // Subtle shadow for elevation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 8,
    paddingHorizontal: 8, // Padding for items from edge
    alignItems: 'flex-start', // Align items to top (icons first) - changed from 'center'
    paddingTop: 8, // Added padding top
  },
  customTabItem: {
    flex: 1, // Distribute space evenly
    justifyContent: 'center', // Center content vertically within item
    alignItems: 'center', // Center content horizontally
    paddingVertical: 0, // Remove vertical padding here, rely on paddingTop in container and label margin
    borderRadius: 12, // Rounded background for focused state
    marginHorizontal: 4, // Spacing between items
  },
  customTabItemFocused: {
    backgroundColor: COLORS.tabBarActiveBackground, // Visual feedback for focus
  },
  customTabLabel: {
    fontSize: 11,
    marginTop: 4, // Space between icon and label
    fontWeight: '500',
  },

  // --- Cards ---
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12, // Consistent corner rounding
    padding: 16, // Standard internal padding
    marginBottom: 16, // Spacing between cards
    shadowColor: '#000', // Subtle shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: Platform.OS === 'android' ? 0 : StyleSheet.hairlineWidth, // Hairline border on iOS
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 16, // Space below title
  },

  // --- Forms & Inputs ---
  inputGroup: {
    marginBottom: 16, // Space between input groups
  },
  label: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 6,
    fontWeight: '500',
  },
  input: {
    backgroundColor: COLORS.inputBackground,
    borderRadius: 8, // Standard input rounding
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12, // Platform-specific padding
    fontSize: 16,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputDisabled: { // Style for disabled inputs
    backgroundColor: COLORS.background, // Indicate non-interactive state
    color: COLORS.textDisabled,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10, // Vertical padding for tap area
    alignSelf: 'flex-start', // Align to left
    marginTop: 4, // Space above toggle button
  },
  toggleButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
    marginRight: 4,
    fontSize: 15,
  },
  optionalFiltersContainer: {
    marginTop: 12, // Space above filters
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 16, // Space below divider
    marginBottom: 4, // Reduce space if button follows directly
  },

  // --- Buttons ---
  button: {
    borderRadius: 25, // Pill shape
    overflow: 'hidden', // Needed for gradient border radius
    marginTop: 16, // Standard space above buttons
  },
  buttonPrimary: {
    // Uses LinearGradient, no specific style needed here unless overriding defaults
  },
  buttonSecondary: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    paddingVertical: 13, // Consistent padding
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48, // Ensure adequate tap height
  },
  buttonGradient: { // Style for the gradient view inside TouchableOpacity
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48, // Ensure adequate tap height
    flexDirection: 'row', // Align icon and text horizontally
    gap: 8, // Space between icon and text within the gradient button
  },
  buttonText: { // For buttons with dark background (like gradient primary)
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  buttonTextSecondary: { // For buttons with light background (like secondary)
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.6, // Visual indication of disabled state
  },

  // --- Loading & Error & Empty States ---
  centeredMessage: { // Used for LoadingIndicator and potentially EmptyState
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: COLORS.background, // Match screen background
    minHeight: 200, // Ensure it takes some space
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  errorCard: {
    backgroundColor: COLORS.errorBackground,
    alignItems: 'center',
    paddingVertical: 30, // More vertical padding
    borderColor: COLORS.error,
    borderWidth: 1,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.error,
    marginTop: 16,
    marginBottom: 10,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20, // Prevent text hitting edges
    lineHeight: 22, // Improve readability
  },
  emptyStateContainer: { // Inherits from centeredMessage styles mostly
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    marginTop: -40, // Pull up slightly if needed, adjust as necessary
    backgroundColor: COLORS.background, // Ensure background match
  },
  emptyStateIcon: {
    marginBottom: 24,
    opacity: 0.6, // Make icon less prominent
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateMessage: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  emptyStateButton: {
    minWidth: '50%', // Make button reasonably wide
    marginTop: 10, // Space between message and button
  },

  // --- Definition Result Card ---
  resultCard: {
    borderColor: COLORS.primaryLight, // Subtle border highlight
    borderWidth: 1,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start', // Align word top-left, icon top-right
    marginBottom: 16,
  },
  resultWord: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    flex: 1, // Allow word to take available space
    marginRight: 12, // Space between word and icon
    lineHeight: 36, // Adjust line height for large font
  },
  bookmarkIcon: {
    paddingTop: 4, // Fine-tune vertical alignment with word
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap', // Allow chips to wrap to next line
    marginBottom: 18, // Space below chips
    gap: 8, // Use gap for spacing between chips (if supported)
    // If gap is not supported: use marginHorizontal: 4, marginVertical: 4 on chip style instead
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.chipBackground,
    borderRadius: 16, // Pill shape
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.primaryLight + '99', // Softer border color
    // Add margin if 'gap' is not used in chipContainer
    // marginHorizontal: 4,
    // marginVertical: 4,
  },
  chipIcon: {
    marginRight: 6,
  },
  chipText: {
    fontSize: 13,
    color: COLORS.primaryDark,
    flexShrink: 1, // Prevent long text from pushing chips out
  },
  chipLabel: {
    fontWeight: '600', // Make label slightly bolder
  },
  definitionBox: {
    backgroundColor: COLORS.background, // Slightly different background for contrast
    borderRadius: 8,
    padding: 16,
    marginBottom: 20, // Space below definition
    // Max height constraint to prevent overly long results dominating the screen
    maxHeight: Dimensions.get('window').height * 0.35, // Adjust percentage as needed
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  definitionText: {
    fontSize: 16,
    lineHeight: 26, // Improve readability
    color: COLORS.textPrimary,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around', // Distribute buttons evenly
    alignItems: 'flex-start', // Align button content (icon+text) to the top
    marginBottom: 16, // Space below actions
    paddingTop: 16, // Space above actions
    borderTopWidth: 1,
    borderTopColor: COLORS.border, // Divider line
  },
  actionButton: {
    alignItems: 'center', // Center icon and text vertically within the button
    paddingHorizontal: 8, // Horizontal space around button content
    flex: 1, // Allow buttons to share width
  },
  actionButtonText: {
    fontSize: 11.5, // Smaller text for compact actions
    color: COLORS.primary,
    marginTop: 4, // Space between icon and text
    fontWeight: '600',
    textAlign: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.4, // Clearer indication of disabled state
  },
  actionButtonTextDisabled: {
    color: COLORS.textDisabled, // Ensure text color also indicates disabled state
  },

  // --- List Screens (Favorites, History, Quiz) ---
  listStyle: { // Style for the FlatList component itself
    flex: 1,
    marginTop: 8, // Space below sorter/header
  },
  listContentContainer: { // Style for the content inside FlatList
    paddingBottom: 30, // Padding at the bottom of the list
  },
  listHeader: { // Container for title and clear button (History)
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0, // Reduce margin below header, rely on sorter margin
    paddingRight: 4, // Align clear button nicely
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  clearButtonText: {
    color: COLORS.error,
    marginLeft: 5,
    fontWeight: '600',
    fontSize: 13,
  },
  listItemCard: { // Base style for items in Fav/History/Quiz lists
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12, // Spacing between list items
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 1, // Minimal elevation for list items
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  listItemIcon: { // Icon on the left (star, history)
    marginRight: 12, // Space between icon and content
    marginLeft: 4, // Indent icon slightly
    width: 24, // Ensure consistent width for alignment
    alignItems: 'center', // Center icon if needed (though size usually handles this)
  },
  listItemContent: { // Container for text (Word, Meta)
    flex: 1, // Take available space
    marginRight: 8, // Space before remove button (if present)
  },
  listItemWord: {
    fontSize: 17,
    fontWeight: '500',
    color: COLORS.textPrimary,
    marginBottom: 3, // Small space below word
  },
  historyMetaContainer: { // Container for history metadata text lines
    marginTop: 3, // Space above metadata
  },
  historyMetaText: { // First line of metadata (Length, Lang)
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  historyMetaTextSmall: { // Second line (Tone, Context)
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 3, // Space between meta lines
    fontStyle: 'italic', // Differentiate second line
  },
  removeButton: { // Button for removing Fav/Quiz items
    padding: 8, // Tap area
    marginLeft: 4, // Space from content
    justifyContent: 'center',
    alignItems: 'center',
  },

  // --- Quiz Specific Styles ---
  quizItemCard: { // Style overrides for quiz list items
    borderLeftWidth: 4,
    borderLeftColor: COLORS.quizAccent,
    backgroundColor: COLORS.quizAccentLight + '40', // Very subtle background tint
    borderColor: COLORS.quizAccent + 'AA', // Use accent border color
  },
  quizItemCardExpanded: {
    paddingBottom: 16, // Add padding when expanded
  },
  quizItemActions: { // Container for toggle/remove buttons in quiz item
    flexDirection: 'row',
    alignItems: 'center',
  },
  quizToggleButton: { // Button to show/hide definition
    padding: 8, // Tap area
    marginRight: 4, // Space before remove button
  },
  quizDefinitionContainer: { // Area shown when definition is expanded
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.quizAccent + '60', // Softer divider line
    // Styling for loading/text within container
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quizDefinitionPlaceholder: { // Text shown while loading definition
    fontSize: 14,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    flexShrink: 1, // Prevent long placeholder text from overflowing
  },
  quizDefinitionText: { // Style for the actual definition text
    fontSize: 15,
    color: COLORS.textPrimary,
    lineHeight: 22,
    flex: 1, // Take available space
  },
  startQuizButton: { // Specific margins for the "Start Quiz" button
    marginBottom: 20, // Space below button
    marginTop: 12, // Space above button (below title)
  },

  // --- Daily Word Card ---
  dailyWordCard: {
    borderColor: COLORS.accent + 'AA', // Accent border
    borderWidth: 1,
    backgroundColor: '#FFFBF2', // Light yellow/orange background tint
  },
  dailyWordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border, // Standard divider
  },
  dailyWordTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primaryDark, // Use darker primary for title
    marginLeft: 10,
  },
  dailyWordWord: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  dailyWordDefinition: {
    fontSize: 15,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginBottom: 12,
    lineHeight: 21,
  },
  dailyWordExample: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  dailyWordButton: {
    backgroundColor: COLORS.accent + 'DD', // Slightly transparent accent
    borderRadius: 20, // Rounded button
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start', // Align button left
  },
  dailyWordButtonText: {
    color: COLORS.textPrimary, // Dark text on light button
    fontWeight: 'bold',
    fontSize: 13.5,
  },

  // --- Recent Searches ---
  recentSearchesCard: {
    // Removed marginTop: 0, let natural card margin handle spacing
    paddingTop: 12, // Less top padding inside card
    paddingBottom: 8, // Less bottom padding inside card
    marginBottom: 16,
  },
  recentSearchItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12, // Vertical padding for touch target and spacing
    borderBottomWidth: StyleSheet.hairlineWidth, // Separator line
    borderBottomColor: COLORS.border,
  },
  recentSearchText: { // Text containing word and meta
    fontSize: 15.5,
    color: COLORS.textPrimary,
    flex: 1, // Allow text to take available space
    marginRight: 8, // Space before chevron
  },
  recentSearchMeta: { // Nested text style for (length, lang)
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  // --- List Sorter ---
  sorterContainer: {
    marginBottom: 16, // Space below sorter
    // Removed marginTop: 0
  },
  sorterLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginLeft: 4, // Align label with list items
  },
  sorterOptionsContainer: { // Content container for the horizontal scroll view
    flexDirection: 'row',
    gap: 10, // Spacing between buttons
    paddingLeft: 4, // Align first button with list items
    paddingRight: 16, // Allow space for scroll end
  },
  sorterButton: { // Individual sort option button
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 18, // Rounded pill shape
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sorterButtonActive: { // Style for the selected sort button
    backgroundColor: COLORS.chipBackground, // Use chip background for active state
    borderColor: COLORS.primary, // Primary border for active state
  },
  sorterButtonText: { // Text inside sort buttons
    fontSize: 13.5,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  sorterButtonTextActive: { // Text style for active sort button
    color: COLORS.primaryDark,
    fontWeight: '600',
  },

  // --- Settings Screen ---
  settingsScrollContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  settingsContentContainer: {
    padding: 16,
    paddingBottom: 40, // Padding at bottom of scroll
  },
  settingsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 16, // Space above section title (first one has padding from container)
    marginBottom: 8, // Space below title, before card
    marginLeft: 4, // Align with card content inset
    textTransform: 'uppercase',
  },
  settingsItem: { // Row container within a card
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16, // Generous vertical padding for touch
    paddingHorizontal: 0, // Padding handled by parent card
  },
  settingsItemNoBorder: { // Use for last item in a card section if divider is used
    borderBottomWidth: 0,
  },
  settingsIconStyle: { // Style for the icon on the left
    marginRight: 16, // Space between icon and text content
    width: 24, // Fixed width for alignment
    alignItems: 'center', // Center icon within its width
  },
  settingsItemContent: { // Container for Text/Description
    flex: 1, // Take available horizontal space
    marginRight: 8, // Space before chevron/value
  },
  settingsItemText: { // Main text label for the setting
    fontSize: 16,
    color: COLORS.textPrimary,
    marginBottom: 2, // Small space if description follows
  },
  settingsItemDescription: { // Smaller descriptive text below label
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18, // Improve readability
  },
  settingsItemValue: { // Value text displayed on the right (e.g., App Version)
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  settingsDivider: { // Divider line between settings items within a card
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: 4, // Small space around divider
    // marginHorizontal: 0, // Let it span the card width (default)
    // Optional: Add left margin to align with text content if icon isn't present
    // marginLeft: 16 + 24 + 16, // Adjust based on icon size and margins if needed
  },

  // --- Toast Notification ---
  toastContainer: {
    position: 'absolute', // Position over other content
    left: 16, // Inset from left
    right: 16, // Inset from right
    borderRadius: 8, // Rounded corners
    paddingVertical: 14, // Vertical padding
    paddingHorizontal: 16, // Horizontal padding
    flexDirection: 'row', // Align icon and text horizontally
    alignItems: 'center', // Align icon and text vertically
    // Shadow/Elevation for visibility
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 1000, // Ensure toast is on top
  },
  toastIcon: {
    marginRight: 12, // Space between icon and text
  },
  toastText: {
    flex: 1, // Allow text to take remaining space
    color: COLORS.toastText, // White text defined in palette
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20, // Ensure text readability
  },
});
