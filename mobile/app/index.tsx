import { Redirect } from 'expo-router';

/** Until P1's role-based routing lands, open straight into the ASHA module. */
export default function Index() {
  return <Redirect href="/asha" />;
}
