import UserDetailPage from './_page'

export function generateStaticParams() { return [{ userId: '0' }] }

export default function Page() {
  return <UserDetailPage />
}
