'use client';

import { useSyncExternalStore } from 'react';
import { acceptConsent, isConsentGiven, subscribeConsent } from '../lib/models/consentRepository';

/**
 * Terms/Privacy acceptance.
 *
 * `accepted` is null during server rendering and hydration (unknown), then a
 * boolean. Views show the consent banner only when it is exactly false, so
 * the server HTML never contains it and hydration never mismatches.
 */
export function useConsentViewModel() {
  const accepted = useSyncExternalStore(subscribeConsent, isConsentGiven, () => null);
  return { accepted, accept: acceptConsent };
}
