import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';

import { useTheme } from '@/features/shared/theme';
import {
  Icon,
  IconButton,
  PrimaryButton,
  Screen,
  SectionHeader,
  Text,
  type IconName,
} from '@/features/shared/ui';

type SupportedReport = {
  id: string;
  name: string;
  icon: IconName;
};

const SUPPORTED_REPORTS: SupportedReport[] = [
  { id: 'blood', name: 'Blood tests', icon: 'water-outline' },
  { id: 'cardio', name: 'Cardiology', icon: 'heart-outline' },
  { id: 'rx', name: 'Prescription', icon: 'receipt-outline' },
  { id: 'imaging', name: 'Imaging', icon: 'scan-outline' },
  { id: 'xray', name: 'X-ray', icon: 'bandage-outline' },
  { id: 'lab', name: 'Blood tests', icon: 'flask-outline' },
];

/**
 * Upload Health Report screen matching Image 4 (right screen).
 * Supports browsing file, showing upload progress, 6 report categories, and "Analyze with AI".
 */
export default function UploadHealthReport() {
  const theme = useTheme();
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: string;
    progress: number;
    uri?: string;
  }>({
    name: 'Health report.png',
    size: '1.8 MB',
    progress: 82,
  });
  const [activeCategory, setActiveCategory] = useState<string>('blood');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysisResult, setShowAnalysisResult] = useState(false);

  const handlePickFile = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        const filename = asset.fileName || 'Health_Report_Scan.jpg';
        const fileSizeMb = asset.fileSize ? (asset.fileSize / (1024 * 1024)).toFixed(1) : '2.1';
        setSelectedFile({
          name: filename,
          size: `${fileSizeMb} MB`,
          progress: 100,
          uri: asset.uri,
        });
      }
    } catch {
      Alert.alert('File Picker', 'Selected demo report document.');
      setSelectedFile({
        name: 'Health report.png',
        size: '1.8 MB',
        progress: 100,
      });
    }
  };

  const handleAnalyze = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      setShowAnalysisResult(true);
    }, 1200);
  };

  return (
    <Screen
      testID="screen-upload-health-report"
      contentStyle={{ gap: theme.space[4] }}
      footer={
        <PrimaryButton
          label={isAnalyzing ? 'Analyzing with AI...' : 'Analyze with AI'}
          onPress={handleAnalyze}
          disabled={isAnalyzing}
          style={{ minHeight: 54, borderRadius: 27, backgroundColor: '#0F172A' }}
        />
      }>
      {/* Top Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton
          icon="arrow-back"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/records'))}
          flipInRTL
        />
        <Text variant="h2" weight="bold" style={{ color: '#0F172A' }}>
          Upload health report
        </Text>
      </View>

      {/* Dotted Upload Dropzone Container (Image 4 right) */}
      <View
        style={{
          borderWidth: 1.5,
          borderColor: '#CBD5E1',
          borderStyle: 'dashed',
          borderRadius: 24,
          padding: 24,
          backgroundColor: '#F8FAFC',
          alignItems: 'center',
          gap: 16,
        }}>
        {/* Upload Circle Icon */}
        <Pressable
          onPress={handlePickFile}
          style={{
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E2E8F0',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 6,
          }}>
          <Icon name="arrow-up" size={26} color="#0F172A" />
        </Pressable>

        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text variant="bodyStrong" style={{ color: '#0F172A' }}>
            Upload your file
          </Text>
          <Text variant="caption" tone="tertiary" align="center">
            Drag & drop your file or browse from your device
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={handlePickFile}
          style={({ pressed }) => ({
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: 14,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E2E8F0',
            opacity: pressed ? 0.8 : 1,
          })}>
          <Text variant="bodySmall" weight="semibold" style={{ color: '#0F172A' }}>
            Drop your file here Or browse file
          </Text>
        </Pressable>

        {/* Uploading File Item Card */}
        {selectedFile && (
          <View
            style={{
              width: '100%',
              backgroundColor: '#FFFFFF',
              borderRadius: 18,
              padding: 14,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              gap: 10,
              marginTop: 4,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: '#0F172A',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Icon name="document-text" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodySmall" weight="semibold" numberOfLines={1}>
                  {selectedFile.name}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {selectedFile.size}
                </Text>
              </View>
            </View>

            {/* Progress Bar & Percentage */}
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="caption" tone="tertiary" style={{ fontSize: 11 }}>
                  Uploading...
                </Text>
                <Text variant="caption" weight="bold" style={{ fontSize: 11, color: '#0F172A' }}>
                  {selectedFile.progress}%
                </Text>
              </View>
              <View
                style={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: '#E2E8F0',
                  overflow: 'hidden',
                }}>
                <View
                  style={{
                    height: '100%',
                    width: `${selectedFile.progress}%`,
                    backgroundColor: '#0F172A',
                    borderRadius: 3,
                  }}
                />
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Supported Reports Section (Image 4 right) */}
      <View style={{ gap: 12, marginTop: 4 }}>
        <SectionHeader title="Supported reports" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {SUPPORTED_REPORTS.map((rep, idx) => {
            const isSelected = activeCategory === rep.id || (rep.id === 'blood' && idx === 0);
            return (
              <Pressable
                key={`${rep.id}-${idx}`}
                accessibilityRole="button"
                onPress={() => setActiveCategory(rep.id)}
                style={({ pressed }) => ({
                  width: '48%',
                  backgroundColor: '#FFFFFF',
                  borderRadius: 18,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: isSelected ? '#0F172A' : '#F1F5F9',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.03,
                  shadowRadius: 4,
                  opacity: pressed ? 0.9 : 1,
                })}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: isSelected ? '#F1F5F9' : '#F8FAFC',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Icon name={rep.icon} size={22} color="#0F172A" />
                </View>
                <Text variant="caption" weight="semibold" style={{ color: '#0F172A' }}>
                  {rep.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* AI Analysis Result Modal */}
      <Modal visible={showAnalysisResult} animationType="slide" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
          }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              padding: 24,
              maxHeight: '85%',
              gap: 16,
            }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#E0F2FE',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Icon name="sparkles" size={20} color="#0284C7" />
                </View>
                <Text variant="h3">AI Report Analysis</Text>
              </View>
              <IconButton icon="close" accessibilityLabel="Close" onPress={() => setShowAnalysisResult(false)} />
            </View>

            <ScrollView contentContainerStyle={{ gap: 14 }}>
              <View
                style={{
                  backgroundColor: '#F0FDF4',
                  borderRadius: 16,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: '#BBF7D0',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}>
                <Icon name="checkmark-circle" size={22} color="#16A34A" />
                <Text variant="bodySmall" weight="semibold" style={{ color: '#15803D', flex: 1 }}>
                  Analysis Complete: 4 Biomarkers detected within normal ranges.
                </Text>
              </View>

              {/* Extracted Biomarkers */}
              <View style={{ gap: 8 }}>
                <Text variant="overline" tone="secondary">
                  EXTRACTED PARAMETERS
                </Text>

                {[
                  { label: 'Fasting Blood Glucose', value: '98 mg/dL', status: 'Optimal', normal: '70-99 mg/dL' },
                  { label: 'HbA1c (Glycated Hb)', value: '5.6 %', status: 'Normal', normal: '< 5.7 %' },
                  { label: 'Total Cholesterol', value: '178 mg/dL', status: 'Desirable', normal: '< 200 mg/dL' },
                  { label: 'Hemoglobin (Hb)', value: '14.2 g/dL', status: 'Normal', normal: '13.5-17.5 g/dL' },
                ].map((item, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 14,
                      backgroundColor: '#F8FAFC',
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                    }}>
                    <View style={{ gap: 2 }}>
                      <Text variant="bodySmall" weight="semibold">
                        {item.label}
                      </Text>
                      <Text variant="caption" tone="tertiary">
                        Ref: {item.normal}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text variant="bodyStrong" style={{ color: '#0F172A' }}>
                        {item.value}
                      </Text>
                      <Text variant="caption" weight="bold" style={{ color: '#16A34A' }}>
                        {item.status}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Clinical Insights */}
              <View style={{ gap: 6 }}>
                <Text variant="overline" tone="secondary">
                  AI RECOMMENDATIONS
                </Text>
                <Text variant="bodySmall" style={{ color: '#334155', lineHeight: 22 }}>
                  Your metabolic profile is well balanced. Continue current exercise routine, maintain 2-3 liters of daily hydration, and schedule your routine checkup in 6 months.
                </Text>
              </View>
            </ScrollView>

            <PrimaryButton
              label="Save to My Health Records"
              icon="checkmark"
              onPress={() => {
                setShowAnalysisResult(false);
                router.replace('/records');
              }}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

