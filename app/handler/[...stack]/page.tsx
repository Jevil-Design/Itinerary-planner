import { StackHandler } from '@stackframe/stack';
import { stackServerApp } from '@/stack';

/** Stack Auth renders sign-in, sign-up, reset and OAuth callbacks here. */
export default function Handler(props: unknown) {
  return <StackHandler fullPage app={stackServerApp} routeProps={props as never} />;
}
