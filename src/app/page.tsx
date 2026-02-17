import PlayerTable from '@/components/PlayerTable';
import { Zap } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen glow-accent" style={{ backgroundColor: '#000000' }}>

      {/* ── Scan line overlay handled by CSS body::after ── */}

      {/* ── Header ── */}
      <header style={{
        borderBottom: '2px solid #FF6600',
        backgroundColor: '#000000',
        padding: '0',
      }}>
        {/* Top bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 24px',
          borderBottom: '1px solid #330000',
        }}>
          {/* Logo + titre */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              backgroundColor: '#330000',
              border: '2px solid #FF6600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 10px rgba(255,102,0,0.4)',
            }}>
              <Zap size={20} color="#FF6600" />
            </div>
            <div>
              <h1 style={{
                fontFamily: "'Press Start 2P', monospace",
                color: '#FF6600',
                fontSize: '1.1em',
                margin: 0,
                lineHeight: 1.2,
                textShadow: '0 0 10px rgba(255,102,0,0.5)',
              }}>
                MFL SCOUT
              </h1>
              <p style={{
                fontFamily: "'Press Start 2P', monospace",
                color: '#555555',
                fontSize: '0.5em',
                margin: '4px 0 0 0',
                letterSpacing: '0.05em',
              }}>
                PLAYER PROGRESSION DASHBOARD
              </p>
            </div>
          </div>

          {/* Right info */}
          <div style={{
            fontFamily: "'Press Start 2P', monospace",
            color: '#333333',
            fontSize: '0.5em',
            textAlign: 'right',
            lineHeight: 2,
          }}>
            <span style={{ color: '#FF6600' }}>■</span> POWERED BY MFL API
          </div>
        </div>

        {/* Nav bar */}
        <nav style={{
          backgroundColor: '#0d0000',
          padding: '6px 24px',
          display: 'flex',
          gap: '4px',
          alignItems: 'center',
          borderBottom: '1px solid #220000',
        }}>
          {['JOUEURS', 'PROGRESSIONS', 'SCOUTS'].map((item, i) => (
            <span
              key={item}
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '0.55em',
                padding: '4px 10px',
                color: i === 0 ? '#FF6600' : '#444444',
                borderBottom: i === 0 ? '2px solid #FF6600' : '2px solid transparent',
                cursor: 'pointer',
                letterSpacing: '0.04em',
              }}
            >
              {item}
            </span>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '0.45em',
              color: '#00FF00',
            }}>
              ● LIVE
            </span>
          </div>
        </nav>
      </header>

      {/* ── Main content ── */}
      <main style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '20px 16px',
        position: 'relative',
        zIndex: 10,
      }}>
        <PlayerTable />
      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid #FF6600',
        backgroundColor: '#000000',
        padding: '12px 24px',
        textAlign: 'center',
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '0.5em',
        color: '#333333',
        marginTop: '40px',
      }}>
        MFL SCOUT © 2025 — DATA REFRESHED 2X/DAY
      </footer>
    </div>
  );
}
