import { Redirect } from 'expo-router';

/** The AI chat lives at /assistant; /chat stays as an alias for older links. */
export default function ChatAlias() {
  return <Redirect href="/assistant" />;
}
