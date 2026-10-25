import { Redirect } from 'expo-router';

// The fixture module is only required in development. Release builds route to sign-in.
export default function DesignPreview() {
  if (!__DEV__) return <Redirect href="/login" />;
  const Preview = require('../dev/preview').default as React.ComponentType;
  return <Preview />;
}
