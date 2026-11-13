import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme, RoleScope, type AppRole } from '@/features/shared/theme';
import {
  Avatar,
  Card,
  EmptyState,
  Glass,
  GlassCross,
  GlowOrb,
  Heading,
  Icon,
  IconButton,
  Pill,
  PrimaryButton,
  Screen,
  SearchBar,
  SecondaryButton,
  SectionHeader,
  ServiceTile,
  StatCard,
  Text,
  TextField,
} from '@/features/shared/ui';

function Section({ name, children }: { name: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space[3] }}>
      <Text variant="overline" tone="tertiary" lang="en">
        {name}
      </Text>
      {children}
    </View>
  );
}

/** /dev/components: every shared UI component, for teammates. Not linked from the app. */
export default function ComponentGallery() {
  const { t } = useTranslation();
  const [role, setRole] = useState<AppRole>('patient');
  return (
    <RoleScope role={role}>
      <Gallery role={role} setRole={setRole} title={t('dev.title')} back={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </RoleScope>
  );
}

function Gallery({ role, setRole, title, back }: { role: AppRole; setRole: (r: AppRole) => void; title: string; back: () => void }) {
  const t = useTheme();
  return (
    <Screen testID="screen-dev-components" contentStyle={{ gap: t.layout.sectionGap }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[3] }}>
        <IconButton icon="arrow-back" flipInRTL accessibilityLabel="Back" onPress={back} />
        <Heading variant="h2">{title}</Heading>
      </View>

      <Section name="Role accent (RoleScope)">
        <View style={{ flexDirection: 'row', gap: t.space[2], flexWrap: 'wrap' }}>
          {(['patient', 'asha', 'doctor', 'admin'] as const).map((r) => (
            <SecondaryButton key={r} label={r} onPress={() => setRole(r)} icon={r === role ? 'checkmark' : undefined} />
          ))}
        </View>
      </Section>

      <Section name="Text variants">
        {(['display', 'h1', 'h2', 'h3', 'title', 'body', 'bodySmall', 'caption'] as const).map((v) => (
          <Text key={v} variant={v}>
            {v} · Aroghya
          </Text>
        ))}
        <Text>नमस्ते · ನಮಸ್ಕಾರ · வணக்கம் · నమస్కారం</Text>
        <Text lang="ur">السلام علیکم</Text>
        <Text numeric>+91 98450 12345</Text>
      </Section>

      <Section name="Buttons">
        <PrimaryButton label="Analyze with AI" icon="sparkles" />
        <PrimaryButton label="Get Started" trailingArrow />
        <SecondaryButton label="Sign in with phone" icon="call" />
        <PrimaryButton label="Disabled" disabled />
        <View style={{ flexDirection: 'row', gap: t.space[2] }}>
          <IconButton icon="search-outline" accessibilityLabel="Search" />
          <IconButton icon="notifications-outline" badge accessibilityLabel="Notifications" />
          <IconButton icon="arrow-back" variant="glass" flipInRTL accessibilityLabel="Back" />
          <IconButton icon="mic" variant="dark" accessibilityLabel="Microphone" />
        </View>
      </Section>

      <Section name="Pill">
        <View style={{ flexDirection: 'row', gap: t.space[2], flexWrap: 'wrap' }}>
          <Pill label="OPTIMAL" tone="success" icon="checkmark-circle" />
          <Pill label="OPTIMAL" tone="success" variant="solid" icon="checkmark-circle" />
          <Pill label="Follow-up visit" tone="info" icon="calendar" />
          <Pill label="High risk" tone="danger" icon="warning" />
          <Pill label="Pending" tone="warning" icon="time" />
          <Pill label="Accent" tone="accent" icon="star" />
        </View>
      </Section>

      <Section name="ServiceTile">
        <View style={{ flexDirection: 'row' }}>
          {(['blue', 'butter', 'mint', 'pink', 'lavender'] as const).map((tint) => (
            <View key={tint} style={{ width: '20%', paddingHorizontal: 4 }}>
              <ServiceTile label={tint} icon="heart" tint={tint} />
            </View>
          ))}
        </View>
      </Section>

      <Section name="StatCard">
        <View style={{ flexDirection: 'row', gap: t.space[3], flexWrap: 'wrap' }}>
          <StatCard label="Heart rate" value="96" unit="bpm" caption="Normal" icon="pulse" chart="ecg" />
          <StatCard label="Weight" value="80" unit="kg" chart="bars" />
          <StatCard label="Blood group" value="A+" icon="water" />
        </View>
      </Section>

      <Section name="Card / SectionHeader / Avatar">
        <Card>
          <SectionHeader title="Upcoming" actionLabel="See all" />
          <View style={{ flexDirection: 'row', gap: t.space[3], alignItems: 'center' }}>
            <Avatar name="Lakshmi Gowda" />
            <Text>Lakshmi Gowda</Text>
          </View>
        </Card>
        <Card tone="inverse">
          <Text tone="inverse" variant="title">
            Inverse card
          </Text>
        </Card>
        <Card tone="accent">
          <Text variant="title">Accent card</Text>
        </Card>
      </Section>

      <Section name="Glass (over a gradient)">
        <View style={{ padding: t.space[4], borderRadius: t.radii.xl, backgroundImage: t.gradient(t.accent.heroGradient, t.accent.heroGradientLocations), backgroundColor: t.accent.accentSoft }}>
          <Glass style={{ padding: t.space[4] }}>
            <Text>Frosted glass (no blur on Android)</Text>
          </Glass>
        </View>
      </Section>

      <Section name="Hero: GlassCross / GlowOrb">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[4] }}>
          <GlassCross size={110} />
          <GlowOrb size={80}>
            <Icon name="heart" color={t.colors.textOnDark} size={32} />
          </GlowOrb>
        </View>
      </Section>

      <Section name="SearchBar / TextField">
        <SearchBar placeholder="Search medicines" />
        <TextField label="Mobile number" prefix="+91" numeric placeholder="98450 12345" />
        <TextField label="6-digit code" numeric error="That code is not right." />
      </Section>

      <Section name="EmptyState">
        <EmptyState icon="document-text-outline" title="Coming soon" body="This screen is part of the next build phase." />
      </Section>

      <Section name="TabBar">
        <Text variant="bodySmall" tone="secondary">
          The floating TabBar is shown on every tab screen (patient, doctor).
        </Text>
      </Section>
    </Screen>
  );
}
