import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';

export function ExploreHomePage() {
  const explorations = useQuery({ queryKey: ['explorations'], queryFn: api.listExplorations });
  return <div className="analysis-list-page">
    <header className="analysis-toolbar">
      <div>
        <h1>Explore</h1>
        <p>Start a standalone analysis workspace or resume a saved session.</p>
      </div>
      <Link className="button-link" to="/explore/new">New standalone session</Link>
    </header>
    <section className="analysis-panel">
      <h2>Saved sessions</h2>
      {explorations.isLoading ? <p>Loading…</p> : explorations.data?.length ? <div className="analysis-session-list">
        {explorations.data.map((exploration) => <Link key={exploration.id} to={`/explore/${exploration.id}`}>
          <strong>{exploration.program_name ?? 'Untitled exploration'}</strong>
          <span>{exploration.auto_run ? 'Auto-run on' : 'Auto-run off'}</span>
          <small>Updated {new Date(exploration.updated_at).toLocaleString()}</small>
        </Link>)}
      </div> : <p>No saved sessions yet.</p>}
    </section>
  </div>;
}
