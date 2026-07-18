import { $serverAction } from './action';

export default function Page() {
  return <main>Action type: {typeof $serverAction}</main>;
}
