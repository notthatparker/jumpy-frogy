import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Scene } from './game/Scene'
import { HUD } from './ui/HUD'
import { useGame } from './game/store'

export default function App() {
  const boot = useGame((s) => s.boot)

  useEffect(() => {
    void boot()
  }, [boot])

  return (
    <div className="app">
      <Canvas shadows camera={{ fov: 42, position: [0, 8.8, -7.5] }}>
        <Scene />
      </Canvas>
      <HUD />
    </div>
  )
}
