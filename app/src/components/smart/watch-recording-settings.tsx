import WatchIcon from '@expo/material-symbols/watch.xml';
import LinkIcon from '@expo/material-symbols/link.xml';
import { useTranslate } from '@tolgee/react';
import { useDispatch } from 'react-redux';
import { useServices } from '@/components/smart/services-provider';
import { SegmentedGroup } from '@/components/presentation/foundation/segmented-list';
import { SegmentedListSwitch } from '@/components/presentation/foundation/segmented-list-switch';
import { SegmentedListLink } from '@/components/presentation/foundation/segmented-list-link';
import { useAppSelector } from '@/store';
import { selectOpenLinkStatus } from '@/store/open-link';
import { setRecordWorkoutsOnWatch } from '@/store/settings';
import { useConfirm } from '@/hooks/useConfirm';

/** Only where OpenWatch is installed: everywhere else there is nothing to switch on. */
export function useCanRecordOnWatch() {
  const { openLinkService } = useServices();
  return openLinkService.isAvailable() && openLinkService.isHostInstalled();
}

export function WatchRecordingSettings() {
  const { t } = useTranslate();
  const dispatch = useDispatch();
  const confirm = useConfirm();
  const { openLinkService } = useServices();
  const canRecordOnWatch = useCanRecordOnWatch();
  const enabled = useAppSelector((state) => state.settings.recordWorkoutsOnWatch);
  const status = useAppSelector(selectOpenLinkStatus);
  if (!canRecordOnWatch) {
    return undefined;
  }

  const action = (() => {
    if (!enabled) {
      return undefined;
    }
    if (status.kind === 'hostUntrusted' && status.signerSha256) {
      return {
        label: t('watch_recording.trust_host.label'),
        supportingText: t('watch_recording.trust_host.subtitle'),
        onPress: () =>
          confirm({
            title: t('watch_recording.trust_host.confirm.title'),
            message: t('watch_recording.trust_host.confirm.body', { key: status.signerSha256 }),
            okText: t('watch_recording.trust_host.confirm.ok'),
            onOk: () => openLinkService.trustHost(status.signerSha256),
          }),
      };
    }
    if (status.kind === 'connected' && status.canOpenConsent) {
      return {
        label: t('watch_recording.allow_in_openwatch.label'),
        supportingText: t('watch_recording.allow_in_openwatch.subtitle'),
        onPress: () => openLinkService.openConsent(),
      };
    }
    return undefined;
  })();

  return (
    <SegmentedGroup>
      <SegmentedListSwitch
        label={t('watch_recording.enabled.label')}
        supportingText={t('watch_recording.enabled.subtitle')}
        icon={WatchIcon}
        systemImage="applewatch"
        value={enabled}
        onValueChange={(value) => dispatch(setRecordWorkoutsOnWatch(value))}
      />
      {action ? (
        <SegmentedListLink
          label={action.label}
          supportingText={action.supportingText}
          icon={LinkIcon}
          systemImage="link"
          onPress={action.onPress}
        />
      ) : undefined}
    </SegmentedGroup>
  );
}
