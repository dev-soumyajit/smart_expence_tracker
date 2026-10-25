import { Redirect } from 'expo-router';

// Native bundles never import the browser gallery or its example financial data.
export default function NativePreviewUnavailable() {
  return <Redirect href="/login" />;
}
