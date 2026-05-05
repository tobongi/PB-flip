import { Composition, registerRoot } from "remotion";
import { FloorMap } from "./FloorMap";
import { SessionSummary } from "./SessionSummary";

// 2s intro + 29 tables × 38 frames + 1s outro = 60 + 1102 + 30 = 1192 frames
const TOTAL_FRAMES = 60 + 29 * 38 + 30;

const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="FloorMap"
        component={FloorMap}
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="SessionSummary"
        component={SessionSummary}
        durationInFrames={960}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};

registerRoot(RemotionRoot);
