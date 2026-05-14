import React, { useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

type Origin = { x: number; y: number } | null;

export function CompletionEffectOverlay({
  origin,
  color,
  effectId,
}: {
  origin: Origin;
  color: string;
  effectId?: string | null;
}) {
  if (!origin || !effectId) return null;

  if (effectId === 'effect_ripple_finish') {
    return <RippleEffect origin={origin} color={color} />;
  }

  if (effectId === 'effect_star_trail') {
    return <StarTrailEffect origin={origin} color={color} />;
  }

  if (effectId === 'effect_orbit_pulse') {
    return <OrbitPulseEffect origin={origin} color={color} />;
  }

  if (effectId === 'effect_flash_bloom') {
    return <FlashBloomEffect origin={origin} color={color} />;
  }

  if (effectId === 'effect_spark_rain') {
    return <SparkRainEffect origin={origin} color={color} />;
  }

  if (effectId === 'effect_echo_wave') {
    return <EchoWaveEffect origin={origin} color={color} />;
  }

  if (effectId === 'effect_comet_arc') {
    return <CometArcEffect origin={origin} color={color} />;
  }

  if (effectId === 'effect_diamond_pop') {
    return <DiamondPopEffect origin={origin} color={color} />;
  }

  if (effectId === 'effect_halo_drift') {
    return <HaloDriftEffect origin={origin} color={color} />;
  }

  return <ConfettiEffect origin={origin} color={color} />;
}

export function EffectPreviewLoop({
  effectId,
  color,
  size = 110,
}: {
  effectId?: string | null;
  color: string;
  size?: number;
}) {
  const [burstKey, setBurstKey] = useState(0);

  useEffect(() => {
    if (!effectId) return;
    setBurstKey((value) => value + 1);
    const interval = setInterval(() => {
      setBurstKey((value) => value + 1);
    }, 1400);
    return () => clearInterval(interval);
  }, [effectId]);

  return (
    <View style={[styles.previewStage, { width: size, height: size }]}>
      <View style={[styles.previewAnchor, { backgroundColor: color }]} />
      {effectId ? (
        <CompletionEffectOverlay
          key={`${effectId}-${burstKey}`}
          origin={{ x: size / 2, y: size / 2 }}
          color={color}
          effectId={effectId}
        />
      ) : null}
    </View>
  );
}

function ConfettiEffect({ origin, color }: { origin: { x: number; y: number }; color: string }) {
  const [particles] = useState(() =>
    Array.from({ length: 22 }).map(() => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
      color: ['#FF6B6B', '#4D96FF', '#00C48C', '#FFB800', '#FFFFFF', color][Math.floor(Math.random() * 6)],
    })),
  );

  useEffect(() => {
    const animations = particles.map((particle, index) => {
      particle.x.setValue(origin.x);
      particle.y.setValue(origin.y);
      particle.opacity.setValue(1);
      particle.scale.setValue(1);

      const angle = (Math.PI * 2 * index) / particles.length;
      const distance = Math.random() * 110 + 35;

      return Animated.parallel([
        Animated.timing(particle.x, {
          toValue: origin.x + Math.cos(angle) * distance,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(particle.y, {
          toValue: origin.y + Math.sin(angle) * distance + Math.random() * 45,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(particle.opacity, {
          toValue: 0,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(particle.scale, {
          toValue: 0,
          duration: 650,
          useNativeDriver: true,
        }),
      ]);
    });
    Animated.stagger(10, animations).start();
  }, [origin, particles]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((particle, index) => (
        <Animated.View
          key={index}
          style={[
            styles.particle,
            {
              backgroundColor: particle.color,
              transform: [
                { translateX: particle.x },
                { translateY: particle.y },
                { scale: particle.scale },
              ],
              opacity: particle.opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

function RippleEffect({ origin, color }: { origin: { x: number; y: number }; color: string }) {
  const scale = useMemo(() => new Animated.Value(0.1), []);
  const opacity = useMemo(() => new Animated.Value(0.9), []);

  useEffect(() => {
    scale.setValue(0.1);
    opacity.setValue(0.9);
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 3,
        duration: 520,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 520,
        useNativeDriver: true,
      }),
    ]).start();
  }, [origin, opacity, scale]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={[
          styles.ripple,
          {
            borderColor: color,
            left: origin.x - 22,
            top: origin.y - 22,
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
    </View>
  );
}

function StarTrailEffect({ origin, color }: { origin: { x: number; y: number }; color: string }) {
  const [particles] = useState(() =>
    Array.from({ length: 14 }).map(() => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
      color: ['#FFF3A3', '#FFFFFF', color, '#FFD166'][Math.floor(Math.random() * 4)],
    })),
  );

  useEffect(() => {
    const animations = particles.map((particle, index) => {
      particle.x.setValue(origin.x);
      particle.y.setValue(origin.y);
      particle.opacity.setValue(1);
      particle.scale.setValue(0.8);

      const lift = Math.random() * 90 + 40;
      const drift = (index % 2 === 0 ? 1 : -1) * (Math.random() * 55 + 10);

      return Animated.parallel([
        Animated.timing(particle.x, {
          toValue: origin.x + drift,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(particle.y, {
          toValue: origin.y - lift,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(particle.opacity, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(particle.scale, {
            toValue: 1.2,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(particle.scale, {
            toValue: 0.2,
            duration: 480,
            useNativeDriver: true,
          }),
        ]),
      ]);
    });
    Animated.stagger(12, animations).start();
  }, [origin, particles]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((particle, index) => (
        <Animated.View
          key={index}
          style={[
            styles.star,
            {
              backgroundColor: particle.color,
              transform: [
                { translateX: particle.x },
                { translateY: particle.y },
                { rotate: `${(index % 4) * 12}deg` },
                { scale: particle.scale },
              ],
              opacity: particle.opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

function OrbitPulseEffect({ origin, color }: { origin: { x: number; y: number }; color: string }) {
  const [rings] = useState(() =>
    [
      { x: -28, y: -6 },
      { x: 26, y: -10 },
      { x: 0, y: 24 },
    ].map((offset) => ({
      ...offset,
      scale: new Animated.Value(0.4),
      opacity: new Animated.Value(0.9),
    })),
  );

  useEffect(() => {
    const animations = rings.map((ring, index) =>
      Animated.sequence([
        Animated.delay(index * 80),
        Animated.parallel([
          Animated.timing(ring.scale, {
            toValue: 1.6,
            duration: 620,
            useNativeDriver: true,
          }),
          Animated.timing(ring.opacity, {
            toValue: 0,
            duration: 620,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    rings.forEach((ring) => {
      ring.scale.setValue(0.4);
      ring.opacity.setValue(0.9);
    });

    Animated.parallel(animations).start();
  }, [origin, rings]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {rings.map((ring, index) => (
        <Animated.View
          key={index}
          style={[
            styles.orbitRing,
            {
              borderColor: color,
              left: origin.x + ring.x - 10,
              top: origin.y + ring.y - 10,
              opacity: ring.opacity,
              transform: [{ scale: ring.scale }],
            },
          ]}
        />
      ))}
    </View>
  );
}

function FlashBloomEffect({ origin, color }: { origin: { x: number; y: number }; color: string }) {
  const flash = useMemo(() => new Animated.Value(0), []);
  const ring = useMemo(() => new Animated.Value(0.3), []);
  const ringOpacity = useMemo(() => new Animated.Value(0.9), []);

  useEffect(() => {
    flash.setValue(0);
    ring.setValue(0.3);
    ringOpacity.setValue(0.9);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(flash, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(flash, {
          toValue: 0,
          duration: 320,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(ring, {
        toValue: 2.6,
        duration: 520,
        useNativeDriver: true,
      }),
      Animated.timing(ringOpacity, {
        toValue: 0,
        duration: 520,
        useNativeDriver: true,
      }),
    ]).start();
  }, [flash, origin, ring, ringOpacity]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={[
          styles.flash,
          {
            left: origin.x - 18,
            top: origin.y - 18,
            backgroundColor: color,
            opacity: flash,
            transform: [{ scale: flash.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.5] }) }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ripple,
          {
            borderColor: color,
            left: origin.x - 22,
            top: origin.y - 22,
            opacity: ringOpacity,
            transform: [{ scale: ring }],
          },
        ]}
      />
    </View>
  );
}

function SparkRainEffect({ origin, color }: { origin: { x: number; y: number }; color: string }) {
  const [particles] = useState(() =>
    Array.from({ length: 12 }).map(() => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0.8),
      color: [color, '#FFFFFF', '#B6C7D6', '#FBCFE8'][Math.floor(Math.random() * 4)],
    })),
  );

  useEffect(() => {
    const animations = particles.map((particle) => {
      const drift = (Math.random() - 0.5) * 70;
      const drop = Math.random() * 85 + 35;
      particle.x.setValue(origin.x + (Math.random() - 0.5) * 22);
      particle.y.setValue(origin.y - 10);
      particle.opacity.setValue(1);
      particle.scale.setValue(0.9);

      return Animated.parallel([
        Animated.timing(particle.x, {
          toValue: origin.x + drift,
          duration: 760,
          useNativeDriver: true,
        }),
        Animated.timing(particle.y, {
          toValue: origin.y + drop,
          duration: 760,
          useNativeDriver: true,
        }),
        Animated.timing(particle.opacity, {
          toValue: 0,
          duration: 760,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(particle.scale, {
            toValue: 1.1,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(particle.scale, {
            toValue: 0.2,
            duration: 540,
            useNativeDriver: true,
          }),
        ]),
      ]);
    });
    Animated.stagger(24, animations).start();
  }, [origin, particles]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((particle, index) => (
        <Animated.View
          key={index}
          style={[
            styles.spark,
            {
              backgroundColor: particle.color,
              transform: [
                { translateX: particle.x },
                { translateY: particle.y },
                { scale: particle.scale },
              ],
              opacity: particle.opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

function EchoWaveEffect({ origin, color }: { origin: { x: number; y: number }; color: string }) {
  const rings = useMemo(
    () => [new Animated.Value(0.2), new Animated.Value(0.2), new Animated.Value(0.2)],
    [],
  );
  const opacities = useMemo(
    () => [new Animated.Value(0.9), new Animated.Value(0.9), new Animated.Value(0.9)],
    [],
  );

  useEffect(() => {
    rings.forEach((ring) => ring.setValue(0.2));
    opacities.forEach((opacity) => opacity.setValue(0.9));
    Animated.parallel(
      rings.map((ring, index) =>
        Animated.sequence([
          Animated.delay(index * 110),
          Animated.parallel([
            Animated.timing(ring, {
              toValue: 2.8,
              duration: 650,
              useNativeDriver: true,
            }),
            Animated.timing(opacities[index], {
              toValue: 0,
              duration: 650,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ),
    ).start();
  }, [opacities, origin, rings]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {rings.map((ring, index) => (
        <Animated.View
          key={index}
          style={[
            styles.ripple,
            {
              borderColor: color,
              left: origin.x - 22,
              top: origin.y - 22,
              opacity: opacities[index],
              transform: [{ scale: ring }],
            },
          ]}
        />
      ))}
    </View>
  );
}

function CometArcEffect({ origin, color }: { origin: { x: number; y: number }; color: string }) {
  const [particles] = useState(() =>
    Array.from({ length: 8 }).map(() => ({
      x: new Animated.Value(origin.x),
      y: new Animated.Value(origin.y),
      opacity: new Animated.Value(1),
      scale: new Animated.Value(0.9),
    })),
  );

  useEffect(() => {
    const animations = particles.map((particle, index) => {
      const xOffset = (index - 3.5) * 14;
      const yOffset = -Math.abs(index - 3.5) * 10 - 36;
      particle.x.setValue(origin.x);
      particle.y.setValue(origin.y);
      particle.opacity.setValue(1);
      particle.scale.setValue(0.9);

      return Animated.parallel([
        Animated.timing(particle.x, {
          toValue: origin.x + xOffset,
          duration: 620,
          useNativeDriver: true,
        }),
        Animated.timing(particle.y, {
          toValue: origin.y + yOffset,
          duration: 620,
          useNativeDriver: true,
        }),
        Animated.timing(particle.opacity, {
          toValue: 0,
          duration: 620,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(particle.scale, {
            toValue: 1.2,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(particle.scale, {
            toValue: 0.3,
            duration: 440,
            useNativeDriver: true,
          }),
        ]),
      ]);
    });
    Animated.stagger(20, animations).start();
  }, [origin, particles]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((particle, index) => (
        <Animated.View
          key={index}
          style={[
            styles.cometDot,
            {
              backgroundColor: index < particles.length / 2 ? color : '#FFFFFF',
              transform: [
                { translateX: particle.x },
                { translateY: particle.y },
                { scale: particle.scale },
              ],
              opacity: particle.opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

function DiamondPopEffect({ origin, color }: { origin: { x: number; y: number }; color: string }) {
  const [particles] = useState(() =>
    Array.from({ length: 10 }).map(() => ({
      x: new Animated.Value(origin.x),
      y: new Animated.Value(origin.y),
      opacity: new Animated.Value(1),
      scale: new Animated.Value(0.8),
      color: [color, '#FFFFFF', '#FBCFE8', '#C7D2FE'][Math.floor(Math.random() * 4)],
    })),
  );

  useEffect(() => {
    const animations = particles.map((particle, index) => {
      const angle = (Math.PI * 2 * index) / particles.length;
      const distance = 55 + Math.random() * 30;
      particle.x.setValue(origin.x);
      particle.y.setValue(origin.y);
      particle.opacity.setValue(1);
      particle.scale.setValue(0.8);

      return Animated.parallel([
        Animated.timing(particle.x, {
          toValue: origin.x + Math.cos(angle) * distance,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(particle.y, {
          toValue: origin.y + Math.sin(angle) * distance,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(particle.opacity, {
          toValue: 0,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(particle.scale, {
            toValue: 1.2,
            duration: 160,
            useNativeDriver: true,
          }),
          Animated.timing(particle.scale, {
            toValue: 0.1,
            duration: 360,
            useNativeDriver: true,
          }),
        ]),
      ]);
    });
    Animated.stagger(14, animations).start();
  }, [origin, particles]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((particle, index) => (
        <Animated.View
          key={index}
          style={[
            styles.diamond,
            {
              backgroundColor: particle.color,
              transform: [
                { translateX: particle.x },
                { translateY: particle.y },
                { rotate: '45deg' },
                { scale: particle.scale },
              ],
              opacity: particle.opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

function HaloDriftEffect({ origin, color }: { origin: { x: number; y: number }; color: string }) {
  const [halos] = useState(() =>
    Array.from({ length: 5 }).map(() => ({
      x: new Animated.Value(origin.x),
      y: new Animated.Value(origin.y),
      opacity: new Animated.Value(0.8),
      scale: new Animated.Value(0.6),
    })),
  );

  useEffect(() => {
    const animations = halos.map((halo, index) => {
      const drift = (Math.random() - 0.5) * 50;
      const lift = 28 + index * 10;
      halo.x.setValue(origin.x);
      halo.y.setValue(origin.y);
      halo.opacity.setValue(0.8);
      halo.scale.setValue(0.6);
      return Animated.sequence([
        Animated.delay(index * 70),
        Animated.parallel([
          Animated.timing(halo.x, {
            toValue: origin.x + drift,
            duration: 760,
            useNativeDriver: true,
          }),
          Animated.timing(halo.y, {
            toValue: origin.y - lift,
            duration: 760,
            useNativeDriver: true,
          }),
          Animated.timing(halo.opacity, {
            toValue: 0,
            duration: 760,
            useNativeDriver: true,
          }),
          Animated.timing(halo.scale, {
            toValue: 1.4,
            duration: 760,
            useNativeDriver: true,
          }),
        ]),
      ]);
    });
    Animated.parallel(animations).start();
  }, [halos, origin]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {halos.map((halo, index) => (
        <Animated.View
          key={index}
          style={[
            styles.halo,
            {
              borderColor: index % 2 === 0 ? color : '#FFFFFF',
              transform: [
                { translateX: halo.x },
                { translateY: halo.y },
                { scale: halo.scale },
              ],
              opacity: halo.opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ripple: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 3,
  },
  star: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  orbitRing: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 2,
  },
  flash: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 999,
  },
  spark: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 7,
    height: 18,
    borderRadius: 999,
  },
  cometDot: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  diamond: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 10,
    height: 10,
  },
  halo: {
    position: 'absolute',
    left: -12,
    top: -12,
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 2,
  },
  previewStage: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewAnchor: {
    width: 10,
    height: 10,
    borderRadius: 999,
    opacity: 0.22,
  },
});
