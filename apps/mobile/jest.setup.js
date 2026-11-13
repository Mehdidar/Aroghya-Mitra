// AsyncStorage has no native module under Jest; the package ships an in-memory mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// expo-audio's native recorder does not exist under Jest (its JS entry reads a native prototype at
// import time). Screens that record voice get an inert recorder so they can render in tests.
jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {}, LOW_QUALITY: {} },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setAudioModeAsync: jest.fn(async () => undefined),
  useAudioRecorder: () => ({
    uri: null,
    isRecording: false,
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(),
    stop: jest.fn(async () => undefined),
    getStatus: jest.fn(() => ({ isRecording: false, durationMillis: 0 })),
  }),
}));
