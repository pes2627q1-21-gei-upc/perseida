import { useTranslation } from 'react-i18next';

import { GelSegmented } from '../../../shared/ui';
import type { MeetingPointProfile } from '../api/meetingPoints';

interface Props {
  value: MeetingPointProfile;
  onChange: (profile: MeetingPointProfile) => void;
}

const PROFILES: readonly MeetingPointProfile[] = ['watch_party', 'study'];

/**
 * What the meeting is for (TG-352): a watch party or a study session. A gel segmented pill
 * announced as a group of radio buttons, since the choice filters the places shown.
 */
export function ProfileSwitch({ value, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <GelSegmented
      kind="choice"
      accessibilityLabel={t('meetingPoints.profile.label')}
      options={PROFILES.map((profile) => ({
        value: profile,
        label: t(`meetingPoints.profile.${profile}`),
      }))}
      value={value}
      onChange={onChange}
    />
  );
}
