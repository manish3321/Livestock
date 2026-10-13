import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SPECIES_LABEL, type ModuleKey, type Permission, type Species } from '@farm/contracts';
import { useAccess } from '../hooks/useAccess';
import { useLocale } from '../locale/LocaleProvider';
import type { RootStackParamList } from '../navigation/types';
import { color } from '../theme/tokens';
import { AnimalPhoto } from './AnimalPhoto';
import { ModuleIcon } from './ModuleIcon';
import { Button, Txt } from './ui';

export interface ChosenAnimal {
  id: string;
  tag: string;
  shortNo?: string | null;
  name?: string | null;
  species?: string | null;
  photoUrl?: string | null;
  penName?: string | null;
}

type Dest = { name: keyof RootStackParamList; params?: object };

const BREEDING_FORMS = ['heat', 'service', 'pd', 'calving'] as const;

const CHOICES: Array<{
  key: 'milk' | 'vaccine' | 'breeding';
  module: ModuleKey;
  permission: Permission;
  tint: string;
  wash: string;
}> = [
  { key: 'milk', module: 'shed', permission: 'rounds:write', tint: color.brand, wash: color.mint },
  { key: 'vaccine', module: 'health', permission: 'health:write', tint: color.info, wash: color.infoSubtle },
  { key: 'breeding', module: 'breeding', permission: 'breeding:write', tint: color.danger, wash: color.dangerSubtle },
];

/** The three big shed jobs, plus a breeding sub-step. Shared by the scan dialog and the scan overlay. */
export function AnimalChoices({ animal, onNavigate }: { animal: ChosenAnimal; onNavigate?: () => void }) {
  const { t } = useLocale();
  const { can } = useAccess();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [breedingOpen, setBreedingOpen] = useState(false);

  useEffect(() => setBreedingOpen(false), [animal.id]);

  const go = (dest: Dest) => {
    onNavigate?.();
    (navigation as { navigate: (name: string, params?: object) => void }).navigate(dest.name, dest.params);
  };

  const pick = (key: (typeof CHOICES)[number]['key']) => {
    if (key === 'milk') go({ name: 'Shed', params: { animalId: animal.id, mode: 'MILKING' } });
    else if (key === 'vaccine') go({ name: 'Health', params: { animalId: animal.id, type: 'VACCINATION' } });
    else setBreedingOpen((v) => !v);
  };

  return (
    <View style={{ gap: 10 }}>
      {CHOICES.filter((c) => can(c.permission)).map((choice) => (
        <View key={choice.key}>
          <Pressable
            onPress={() => pick(choice.key)}
            style={({ pressed }) => [
              styles.choice,
              { borderColor: choice.tint, backgroundColor: choice.wash },
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t(`qr.choice.${choice.key}`)}
          >
            <View style={[styles.choiceIcon, { backgroundColor: choice.tint }]}>
              <ModuleIcon module={choice.module} size={28} color="#FFFDF9" />
            </View>
            <View style={{ flex: 1 }}>
              <Txt weight="display" style={[styles.choiceTitle, { color: choice.tint }]}>
                {t(`qr.choice.${choice.key}`)}
              </Txt>
              <Txt muted style={styles.choiceHint}>
                {t(`qr.choice.${choice.key}Hint`)}
              </Txt>
            </View>
            <Txt weight="bold" style={[styles.arrow, { color: choice.tint }]}>
              {choice.key === 'breeding' && breedingOpen ? '⌄' : '›'}
            </Txt>
          </Pressable>
          {choice.key === 'breeding' && breedingOpen ? (
            <View style={styles.sub}>
              <Txt weight="semibold" style={{ fontSize: 13 }}>
                {t('qr.breedingWhich')}
              </Txt>
              <View style={styles.subGrid}>
                {BREEDING_FORMS.map((form) => (
                  <View key={form} style={styles.subTile}>
                    <Button
                      label={t(`qr.action.${form}`)}
                      variant="urgent"
                      block
                      onPress={() => go({ name: 'Breeding', params: { form, animalId: animal.id } })}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function AnimalChoiceDialog({
  animal,
  onClose,
}: {
  animal: ChosenAnimal | null;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  if (!animal) return null;
  const label =
    animal.name?.trim() || SPECIES_LABEL[animal.species as Species] || animal.species || '';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.dialog}>
          <View style={styles.who}>
            <AnimalPhoto animalId={animal.id} photoUrl={animal.photoUrl} species={animal.species} size={84} />
            <View style={{ flex: 1 }}>
              <Txt weight="display" style={styles.tag}>
                {animal.shortNo ?? animal.tag}
              </Txt>
              <Txt muted numberOfLines={2}>
                {[label, animal.penName].filter(Boolean).join(' · ')}
              </Txt>
            </View>
          </View>
          <Txt weight="display" style={styles.title}>
            {t('qr.chooseTitle')}
          </Txt>
          <Txt muted style={{ marginBottom: 12 }}>
            {t('qr.chooseHint')}
          </Txt>
          <AnimalChoices animal={animal} onNavigate={onClose} />
          <View style={styles.footer}>
            <Button
              label={t('qr.otherActions')}
              variant="secondary"
              onPress={() => {
                onClose();
                navigation.navigate('AnimalDetail', { id: animal.id });
              }}
            />
            <Button label={t('qr.cancel')} variant="ghost" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 38, 28, 0.65)',
    justifyContent: 'center',
    padding: 16,
  },
  dialog: {
    backgroundColor: color.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: color.border,
    borderTopWidth: 4,
    borderTopColor: color.brand,
    padding: 18,
    maxHeight: '92%',
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  tag: { fontSize: 26, color: color.brandStrong },
  title: { fontSize: 20, color: color.textPrimary },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderBottomWidth: 4,
  },
  pressed: { opacity: 0.85, transform: [{ translateY: 1 }] },
  choiceIcon: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  choiceTitle: { fontSize: 20 },
  choiceHint: { fontSize: 12, marginTop: 2 },
  arrow: { fontSize: 28 },
  sub: {
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: color.dangerSubtle,
    gap: 8,
  },
  subGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  subTile: { width: '48%', flexGrow: 1 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 16 },
});
