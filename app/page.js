'use client';

import { Suspense, use, useEffect } from 'react';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function test1(ms) {
  await sleep(ms);
  return 123;
}

function AsyncComp1() {
  use(sleep(2000));
  useEffect(() => console.log(`comp1 mounted at ${Date.now() - window.startTime}`), []);
  return 'comp1 pending for 2s';
}

function AsyncComp2() {
  use(sleep(3000));
  useEffect(() => console.log(`Comp2 mounted at ${Date.now() - window.startTime}`), []);
  return 'comp2 pending for 3s';
}

function AsyncComp3() {
  use(test1(3000));
  useEffect(() => console.log(`Comp3 mounted at ${Date.now() - window.startTime}`), []);
  return <div onClick={() => console.log('comp3')}>comp3 pending for 3s</div>;
}

export default function Home() {
  useEffect(() => console.log(`Home mounted at ${Date.now() - window.startTime}`), []);
  return (
    <>
      <Suspense fallback="loading1..."><AsyncComp1 /></Suspense>
      <br />
      <Suspense fallback="loading2..."><AsyncComp2 /></Suspense>
      <br />
      <Suspense fallback="loading3..."><AsyncComp3 /></Suspense>
    </>
  );
}
