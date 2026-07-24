import { Canvas } from '@react-three/fiber'
import { Scene } from './game/Scene'
import { HUD } from './ui/HUD'

export default function App() {
  return (
    <div className="app">
      <Canvas shadows camera={{ fov: 42, position: [0, 8.8, -7.5] }}>
        <Scene />
      </Canvas>
      <HUD />
    </div>
  )
}
