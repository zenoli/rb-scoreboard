import PlayerDetailPage from './_page'

export function generateStaticParams() { return [{ playerId: '0' }] }

export default function Page() {
  return <PlayerDetailPage />
}
