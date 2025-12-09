export default function NotFound() {
  return (
    <div style={{ 
      padding: '2rem', 
      fontFamily: 'system-ui',
      maxWidth: '600px',
      margin: '0 auto',
      textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '4rem', margin: '0' }}>404</h1>
      <h2>Page Not Found</h2>
      <p style={{ marginTop: '1rem', color: '#666' }}>
        The page you are looking for does not exist.
      </p>
      <a 
        href="/"
        style={{
          display: 'inline-block',
          marginTop: '1.5rem',
          padding: '0.5rem 1rem',
          background: '#000',
          color: '#fff',
          textDecoration: 'none',
          borderRadius: '4px'
        }}
      >
        Go Home
      </a>
    </div>
  )
}