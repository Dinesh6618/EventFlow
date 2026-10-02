import Alert from './Alert.jsx';
import Button from './Button.jsx';

export default function LoadError({ error, onRetry }) {
  return (
    <Alert
      type="error"
      action={
        onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    >
      {error?.message || 'Something went wrong while loading this page.'}
    </Alert>
  );
}
