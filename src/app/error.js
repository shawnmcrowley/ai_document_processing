'use client'

export default function Error({ error, reset }) {
  return (
    <div style={{ 
      padding: '2rem', 
      fontFamily: 'system-ui',
      maxWidth: '600px',
      margin: '0 auto'
    }}>
      <h1 style={{ color: '#dc2626' }}>Something went wrong!</h1>
      <p style={{ marginTop: '1rem', color: '#666' }}>
        {error.message || 'An unexpected error occurred'}
      </p>
      <button
        onClick={() => reset()}
        style={{
          marginTop: '1.5rem',
          padding: '0.5rem 1rem',
          background: '#000',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Try again
      </button>
    </div>
  )
}