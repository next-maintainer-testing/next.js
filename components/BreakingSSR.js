export function BreaksServerRendering() {
  return (
    <>
      <button>
        Outer Button 1
        <div><button>Inner button 1</button></div>
      </button>
      <button>
        Outer Button 2
        <div><button>Inner Button 2</button></div>
      </button>
    </>
  );
}
