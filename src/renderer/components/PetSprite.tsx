import "../shell/PetApp.css";

interface PetSpriteProps {
  spritesheetUrl: string;
  frameWidth: number;
  frameHeight: number;
  frameIndex: number;
  columns: number;
  displayHeight: number;
  animationName?: string;
}

export function PetSprite(props: PetSpriteProps) {
  const column = props.frameIndex % props.columns;
  const row = Math.floor(props.frameIndex / props.columns);
  const scale = props.displayHeight / props.frameHeight;

  return (
    <div
      className="pet-sprite"
      data-animation={props.animationName}
      style={{
        width: props.frameWidth * scale,
        height: props.frameHeight * scale,
        backgroundImage: `url(${props.spritesheetUrl})`,
        backgroundSize: `${props.frameWidth * props.columns * scale}px auto`,
        backgroundPosition: `-${column * props.frameWidth * scale}px -${row * props.frameHeight * scale}px`,
      }}
      aria-label="LacriTomato Mini"
    />
  );
}
