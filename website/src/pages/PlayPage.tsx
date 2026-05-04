import { motion } from 'framer-motion';
import GameIframe from '@/components/GameIframe';

export default function PlayPage() {
  return (
    <motion.div
      key="play"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 pt-14 bg-olive-950"
    >
      <GameIframe />
    </motion.div>
  );
}
