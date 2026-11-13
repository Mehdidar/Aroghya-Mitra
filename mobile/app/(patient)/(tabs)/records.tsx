import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';

import { useTheme } from '@/features/shared/theme';
import {
  EcgPulseChart,
  Icon,
  IconButton,
  PrimaryButton,
  Screen,
  SectionHeader,
  Text,
  type IconName,
} from '@/features/shared/ui';

type ReportCategory = {
  id: string;
  title: string;
  filesCount: number;
  icon: IconName;
  color: string;
  bgColor: string;
  updatedAt: string;
  files: { name: string; date: string; size: string }[];
};

const REPORT_CATEGORIES: ReportCategory[] = [
  {
    id: 'general',
    title: 'General Health',
    filesCount: 8,
    icon: 'document-text',
    color: '#0284C7',
    bgColor: '#E0F2FE',
    updatedAt: 'Yesterday',
    files: [
      { name: 'Annual Complete Health Checkup.pdf', date: '12 Nov 2026', size: '2.4 MB' },
      { name: 'Routine Urine Analysis.pdf', date: '28 Oct 2026', size: '1.1 MB' },
      { name: 'Complete Blood Count (CBC).pdf', date: '15 Sep 2026', size: '840 KB' },
    ],
  },
  {
    id: 'diabetes',
    title: 'Diabetes',
    filesCount: 4,
    icon: 'document-text',
    color: '#8B5CF6',
    bgColor: '#EDE9FE',
    updatedAt: '3 days ago',
    files: [
      { name: 'HbA1c Glycated Hemoglobin.pdf', date: '10 Nov 2026', size: '1.2 MB' },
      { name: 'Fasting Blood Glucose Test.pdf', date: '22 Oct 2026', size: '920 KB' },
      { name: 'Postprandial Blood Sugar.pdf', date: '22 Oct 2026', size: '890 KB' },
    ],
  },
  {
    id: 'cardiology',
    title: 'Cardiology',
    filesCount: 2,
    icon: 'pulse',
    color: '#EF4444',
    bgColor: '#FEE2E2',
    updatedAt: '12 Oct 2026',
    files: [
      { name: '12-Lead Electrocardiogram (ECG).pdf', date: '12 Oct 2026', size: '3.1 MB' },
      { name: 'Echocardiography Report.pdf', date: '04 Jul 2026', size: '4.5 MB' },
    ],
  },
  {
    id: 'prescriptions',
    title: 'Prescriptions',
    filesCount: 5,
    icon: 'receipt',
    color: '#059669',
    bgColor: '#D1FAE5',
    updatedAt: '05 Nov 2026',
    files: [
      { name: 'Dr. Mim Akhter - Prescription.pdf', date: '05 Nov 2026', size: '650 KB' },
      { name: 'Dr. Olivia Wilson - Skin Therapy.pdf', date: '18 Aug 2026', size: '540 KB' },
    ],
  },
];

/**
 * Health Report & Medical Records screen matching Image 1 (right screen).
 * Shows live heart rate with ECG pulse graph, Blood Group, Weight, and Latest Reports.
 */
export default function PatientRecords() {
  const { t } = useTranslation('patient');
  const theme = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | null>(null);

  const handleCardMenu = (title: string) => {
    Alert.alert(title, 'Choose an option', [
      { text: 'View Details', onPress: () => {} },
      { text: 'Download PDF', onPress: () => {} },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Screen withTabBar testID="screen-patient-records" contentStyle={{ gap: theme.space[4] }}>
      {/* Top Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="h1" weight="bold">
          {t('records.title', { defaultValue: 'Report' })}
        </Text>
        <IconButton
          icon="ellipsis-horizontal"
          accessibilityLabel="Options"
          onPress={() => handleCardMenu('Report Options')}
        />
      </View>

      {/* Heart Rate Hero Card (Image 1 right) */}
      <View
        accessible
        accessibilityLabel="Heart Rate: 96 bpm"
        style={{
          backgroundColor: '#E0F2FE',
          borderRadius: 24,
          padding: 20,
          gap: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.04,
          shadowRadius: 12,
          elevation: 2,
        }}>
        <Text variant="title" tone="secondary" style={{ color: '#0369A1' }}>
          Heart Rate
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text variant="display" weight="bold" style={{ color: '#0F172A', fontSize: 44, lineHeight: 48 }}>
              96
            </Text>
            <Text variant="bodySmall" weight="medium" style={{ color: '#475569', paddingBottom: 6 }}>
              bpm
            </Text>
          </View>
          <View style={{ flex: 1, maxWidth: 180, alignSelf: 'center' }}>
            <EcgPulseChart height={50} color="#0D9488" strokeWidth={2.8} />
          </View>
        </View>
      </View>

      {/* Stat Cards Grid: Blood Group & Weight (Image 1 right) */}
      <View style={{ flexDirection: 'row', gap: 14 }}>
        {/* Blood Group Card */}
        <View
          style={{
            flex: 1,
            backgroundColor: '#FFE4E6',
            borderRadius: 22,
            padding: 18,
            gap: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.03,
            shadowRadius: 8,
          }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: 'rgba(244, 63, 94, 0.15)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name="water" size={20} color="#E11D48" />
            </View>
            <Pressable hitSlop={10} onPress={() => handleCardMenu('Blood Group')}>
              <Icon name="ellipsis-horizontal" size={18} color="#94A3B8" />
            </Pressable>
          </View>
          <View style={{ gap: 2 }}>
            <Text variant="caption" tone="secondary" style={{ color: '#64748B' }}>
              Blood Group
            </Text>
            <Text variant="h2" weight="bold" style={{ color: '#0F172A' }}>
              A+
            </Text>
          </View>
        </View>

        {/* Weight Card */}
        <View
          style={{
            flex: 1,
            backgroundColor: '#DCFCE7',
            borderRadius: 22,
            padding: 18,
            gap: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.03,
            shadowRadius: 8,
          }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: 'rgba(22, 163, 74, 0.15)',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name="body" size={20} color="#16A34A" />
            </View>
            <Pressable hitSlop={10} onPress={() => handleCardMenu('Weight')}>
              <Icon name="ellipsis-horizontal" size={18} color="#94A3B8" />
            </Pressable>
          </View>
          <View style={{ gap: 2 }}>
            <Text variant="caption" tone="secondary" style={{ color: '#64748B' }}>
              Weight
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text variant="h2" weight="bold" style={{ color: '#0F172A' }}>
                80
              </Text>
              <Text variant="caption" tone="secondary" style={{ color: '#475569' }}>
                kg
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Latest Reports Section Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <SectionHeader title="Latest Report" />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/upload-report')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 20,
            backgroundColor: '#F1F5F9',
          }}>
          <Icon name="cloud-upload-outline" size={16} color="#0F172A" />
          <Text variant="caption" weight="bold" style={{ color: '#0F172A' }}>
            Upload
          </Text>
        </Pressable>
      </View>

      {/* Latest Reports List */}
      <View style={{ gap: 12 }}>
        {REPORT_CATEGORIES.map((cat) => (
          <View
            key={cat.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
              borderRadius: 20,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: '#F1F5F9',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.03,
              shadowRadius: 8,
            }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${cat.title}, ${cat.filesCount} files`}
              onPress={() => setSelectedCategory(cat)}
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                opacity: pressed ? 0.8 : 1,
              })}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: cat.bgColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Icon name={cat.icon} size={24} color={cat.color} />
              </View>
              <View style={{ gap: 2, flex: 1 }}>
                <Text variant="bodyStrong" style={{ color: '#0F172A' }}>
                  {cat.title}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {cat.filesCount} files · Updated {cat.updatedAt}
                </Text>
              </View>
            </Pressable>

            <IconButton
              icon="ellipsis-horizontal"
              accessibilityLabel={`${cat.title} options`}
              onPress={() => handleCardMenu(cat.title)}
            />
          </View>
        ))}
      </View>

      {/* Upload Health Report Banner */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/upload-report')}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          padding: 18,
          borderRadius: 22,
          backgroundColor: '#0F172A',
          marginTop: 6,
          opacity: pressed ? 0.92 : 1,
        })}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="arrow-up-circle" size={26} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" style={{ color: '#FFFFFF' }}>
            Upload health report
          </Text>
          <Text variant="caption" style={{ color: 'rgba(255, 255, 255, 0.75)' }}>
            AI analyzes your lab tests & vitals instantly
          </Text>
        </View>
        <Icon name="chevron-forward" size={20} color="#FFFFFF" flipInRTL />
      </Pressable>

      {/* Category Detail Modal */}
      <Modal visible={!!selectedCategory} animationType="slide" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
          }}>
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              padding: 24,
              maxHeight: '80%',
              gap: 18,
            }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {selectedCategory && (
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: selectedCategory.bgColor,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Icon name={selectedCategory.icon} size={22} color={selectedCategory.color} />
                  </View>
                )}
                <Text variant="h3">{selectedCategory?.title}</Text>
              </View>
              <IconButton icon="close" accessibilityLabel="Close" onPress={() => setSelectedCategory(null)} />
            </View>

            <ScrollView contentContainerStyle={{ gap: 12 }}>
              {selectedCategory?.files.map((file, idx) => (
                <View
                  key={idx}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 14,
                    borderRadius: 16,
                    backgroundColor: '#F8FAFC',
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                  }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    <Icon name="document-text" size={24} color="#64748B" />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodySmall" weight="semibold" numberOfLines={1}>
                        {file.name}
                      </Text>
                      <Text variant="caption" tone="tertiary">
                        {file.date} · {file.size}
                      </Text>
                    </View>
                  </View>
                  <IconButton
                    icon="download-outline"
                    accessibilityLabel="Download file"
                    onPress={() => Alert.alert('Downloading', `Downloading ${file.name}`)}
                  />
                </View>
              ))}
            </ScrollView>

            <PrimaryButton
              label="Upload new file in this category"
              icon="cloud-upload-outline"
              onPress={() => {
                setSelectedCategory(null);
                router.push('/upload-report');
              }}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
