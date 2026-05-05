import GameIframe from '@/components/GameIframe';

// No framer-motion wrapper here: any compositing/transition on an ancestor of
// the gameplay <iframe> causes mobile browsers (especially iOS Safari) to
// throttle the iframe's requestAnimationFrame loop, producing the stutter the
// game shows on Vercel. Plain DOM keeps the iframe at full framerate.
export default function PlayPage() {
  return (
    <div className="fixed inset-0 pt-14 bg-olive-950">
      <GameIframe />
    </div>
  );
}
