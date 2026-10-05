/**
 * Privacy Policy and Terms & Conditions, rendered in-app.
 *
 * The same documents the web Command Centre publishes at /privacy and /terms,
 * shown in a modal rather than a browser link: the person reading them is an
 * agent on a cheap phone who may have no data bundle for an external site --
 * the legal text has to be readable offline, before they sign in.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HIT_SLOP, colors, radius, spacing, typography } from '../theme';

export type LegalDocument = 'privacy' | 'terms';

interface LegalSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

const LAST_UPDATED = '4 October 2026';

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    paragraphs: [
      'Sentinel is an election intelligence and field operations platform used by campaign teams in Kenya. This policy explains what personal data Sentinel collects, why, and the rights you have over it. We process personal data in line with the Kenya Data Protection Act, 2019.',
    ],
  },
  {
    heading: '1. Who is responsible for your data',
    paragraphs: [
      "Each campaign that uses Sentinel decides what data it records about its supporters and agents and is the data controller for that data. Sentinel provides the platform and processes data on the campaign's behalf.",
    ],
  },
  {
    heading: '2. Data we collect',
    bullets: [
      'Account data: name, email address, phone number, role and assigned polling station or area.',
      'Field data: polling station results submitted by agents, photographs of statutory result forms, incident reports and related notes.',
      'Supporter and group data: names, phone numbers and polling centres of supporters and group members entered by campaign staff.',
      'Messages: chats, voice notes and images exchanged between agents and the command centre, and broadcast messages.',
      'Technical data: sign-in times, device and browser information and activity logs used to keep the platform secure.',
    ],
  },
  {
    heading: '3. How we use it',
    bullets: [
      'To authenticate users and control who can see what.',
      'To collect, verify and report polling station results.',
      'To coordinate agents and communicate with them and with supporters.',
      'To keep an audit trail of who did what, and when.',
      'To protect the platform against misuse and to fix faults.',
    ],
    paragraphs: ['We do not sell personal data and we do not use it for advertising.'],
  },
  {
    heading: '4. Access and sharing',
    paragraphs: [
      'Access is limited by role. Agents see only their own assignments and conversations. Campaign administrators see the data of their own campaign. We use trusted service providers for hosting, storage, SMS delivery and push notifications, and they may process data only on our instructions. We may disclose data where the law requires it.',
    ],
  },
  {
    heading: '5. Evidence and audit records',
    paragraphs: [
      'Photographs of result forms and the activity log are kept as evidence. They are recorded with a time, the person who uploaded them and a fingerprint of the file, and are not edited after submission. A correction is added as a new record rather than overwriting the old one.',
    ],
  },
  {
    heading: '6. Security',
    paragraphs: [
      'Access is by individually issued accounts, there is no public sign-up, and access is monitored and logged. Files are stored in access-controlled storage and data is transmitted over encrypted connections. No system is completely secure, so please keep your password private and report any suspected misuse straight away.',
    ],
  },
  {
    heading: '7. Retention',
    paragraphs: [
      "We keep data for as long as the campaign needs it for the election cycle and any resulting disputes or legal obligations, after which it is deleted or anonymised on the campaign's instruction.",
    ],
  },
  {
    heading: '8. Your rights',
    paragraphs: ['Under the Data Protection Act you may ask to:'],
    bullets: [
      'know what personal data is held about you and get a copy;',
      'correct data that is wrong or incomplete;',
      'object to processing or ask for deletion, where the law allows;',
      'complain to the Office of the Data Protection Commissioner (ODPC) if you think your data has been mishandled.',
    ],
  },
  {
    heading: '9. Not affiliated with the IEBC',
    paragraphs: [
      "Sentinel is not an IEBC system and is not owned, operated, certified or endorsed by the Independent Electoral and Boundaries Commission of Kenya. Results recorded here are a campaign's own record and are not official results.",
    ],
  },
  {
    heading: '10. Changes to this policy',
    paragraphs: ['We may update this policy. The date at the top shows when it last changed.'],
  },
  {
    heading: '11. Contact',
    paragraphs: [
      'For privacy questions or to exercise your rights, contact your campaign administrator.',
    ],
  },
];

const TERMS_SECTIONS: LegalSection[] = [
  {
    paragraphs: [
      'These terms govern your use of Sentinel. By signing in you agree to them. If you do not agree, do not use the platform.',
    ],
  },
  {
    heading: '1. Who may use Sentinel',
    paragraphs: [
      'Sentinel is for authorised campaign staff and agents only. Accounts are created by administrators or issued through an invitation. There is no public sign-up. Your account is personal to you and must not be shared.',
    ],
  },
  {
    heading: '2. Your responsibilities',
    bullets: [
      'Keep your password confidential and sign out on shared devices.',
      'Enter results exactly as they appear on the statutory form. Never submit figures you know or suspect to be wrong.',
      'Photograph the actual form for the polling station you are assigned to, and do not alter or fabricate images.',
      "Use supporter and agent data only for the campaign's lawful purposes.",
      'Report any suspected unauthorised access straight away.',
    ],
  },
  {
    heading: '3. Acceptable use',
    paragraphs: ['You must not:'],
    bullets: [
      'try to access data or accounts you are not authorised to see;',
      'interfere with, probe or overload the platform;',
      'send abusive, unlawful or misleading messages through it;',
      'copy or share personal data outside the campaign without a lawful basis;',
      'use it to spread false results or disinformation.',
    ],
  },
  {
    heading: '4. Monitoring and audit trail',
    paragraphs: [
      'Access is monitored and logged. Submissions, verifications and other actions are recorded with who did them and when. Submitted evidence is not edited; corrections are added as new records.',
    ],
  },
  {
    heading: '5. Not an official system',
    paragraphs: [
      "Sentinel is not an IEBC system and is not owned, operated, certified or endorsed by the Independent Electoral and Boundaries Commission of Kenya. Figures in Sentinel are a campaign's own record and are not official election results.",
    ],
  },
  {
    heading: '6. Availability',
    paragraphs: [
      "We work to keep Sentinel available, especially on election day, but we cannot guarantee uninterrupted service. Agents should always keep the original forms and follow the campaign's own instructions if the platform is unavailable.",
    ],
  },
  {
    heading: '7. Suspension',
    paragraphs: [
      'Administrators may suspend or remove an account at any time, including where these terms are broken or misuse is suspected.',
    ],
  },
  {
    heading: '8. Liability',
    paragraphs: [
      'To the extent the law allows, Sentinel is provided "as is" and we are not liable for losses arising from its use, including decisions made on figures that were entered incorrectly or that are not yet verified. Nothing in these terms limits liability that cannot be limited by law.',
    ],
  },
  {
    heading: '9. Privacy',
    paragraphs: ['How we handle personal data is explained in our Privacy Policy.'],
  },
  {
    heading: '10. Governing law',
    paragraphs: ['These terms are governed by the laws of Kenya.'],
  },
  {
    heading: '11. Changes and contact',
    paragraphs: [
      'We may update these terms; the date at the top shows the latest version. Continued use means you accept the update. Questions? Contact your campaign administrator.',
    ],
  },
];

export function LegalModal({
  document,
  onClose,
}: {
  document: LegalDocument;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const title = document === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions';
  const sections = document === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.updated}>Last updated {LAST_UPDATED}</Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={`Close ${title}`}
          >
            <Ionicons name="close" size={24} color={colors.inkMuted} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxl }]}
          showsVerticalScrollIndicator
        >
          {sections.map((section, i) => (
            <View key={i} style={styles.section}>
              {section.heading ? (
                <Text style={styles.heading}>{section.heading}</Text>
              ) : null}
              {(section.paragraphs ?? []).map((paragraph, pi) => (
                <Text key={pi} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
              {(section.bullets ?? []).map((bullet, bi) => (
                <View key={bi} style={styles.bulletRow}>
                  <Text style={styles.bulletMark}>{'\u2022'}</Text>
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { ...typography.heading, color: colors.ink },
  updated: { ...typography.caption, fontSize: 11, color: colors.inkMuted },
  body: { padding: spacing.base, gap: spacing.md },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.base,
    gap: spacing.sm,
  },
  heading: { ...typography.bodyStrong, fontSize: 15, color: colors.ink },
  paragraph: { ...typography.body, fontSize: 14, color: colors.inkMuted, lineHeight: 21 },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.sm },
  bulletMark: { ...typography.body, color: colors.green, lineHeight: 21 },
  bulletText: {
    ...typography.body,
    fontSize: 14,
    color: colors.inkMuted,
    lineHeight: 21,
    flex: 1,
  },
});
