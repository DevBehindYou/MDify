// Geometry-aware refraction filter bank. Rendered once (in the root layout);
// the glass utility classes in globals.css reference these by id.
//
// Each filter runs two chained feDisplacementMap passes over hand-built
// edge-lens maps (MAIN = broad bend, EDGE = sharp rim echo) — real glass-like
// lensing, not the noisy field feTurbulence produces. Blur stays ≤0.3px.

const MAIN =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAACe0lEQVR42u3dwY6CQBBF0a4uPtxPdyWmU3SAZcM5MYZMMrMQbx7oYiLi035ifJ49+tFzL8f1kWc/ybPfrX8/xoP9OcpxGw/2Z+p5b5PXsJ702RnJy2+DvPA+6ZP3WMxPfX0cnvfu9PNmAkAA8FabC2EsAFgAsABgAUAAIAAQAAgABAACAAGAAGD9AHwXjAUACwAWACwAWACwACAAEAC4BwALAAIAAYAAQAAgABAACAAEAAsEkF4ELAAIAAQAAgABgE+BwAKAAEAAIABwEwwWAAQAAgABgABAACAAEAD4IgwsAPj/AGABQAAgABAACAB8CgQWAAQALoHAAoAFAAsAFgAEAAIA9wBgAUAAIAC4xR0AFgAEAC6BwAKABQALABYABAACAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAGAABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACADu2Vp4EbAAYAHAAoAFAAGASyCwACAAEAA8LAB3AVgAEAAIANwDgAUACwAWACwACABcAoEFAAGAAEAAIADwKRBYAFglgPQiYAFAACAAEAAIAAQAAgABgC/CwAKAAEAAIABwEwwWAAQAAgABgADAp0BgAUAAIAAQAAgABAACAAGAAMD/BwALAAIAAYB7ALAAYAHAAoAFAAsAFgAEAAIAAYAAQAAgABAACAD+fA+MBQALABYALAAIAAQAD/cFuFkFrlqiYvIAAAAASUVORK5CYII=';

const EDGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAACcklEQVR42u3dsarCQBCG0X+TSZ7bR7eQDQuxsJLAnEOQW1kM+91JoXGM8Uoyki0Zyb5clVRyzNfPdd7+WK+a1/Um23znEfjVmGdyux3I+nbwvh7LWs7kerCv055kM2s6K/+Z6R2AHYANAF0D2A0BAYAAQADQKoAyBAQATQM4DAEbAGwAEAAIALoEcBoCNgAIANwCgQ0AAgABgABAACAA8GlQEAAIAHwpHgQAAgAPxwUBgKdDgwDgwdwAIQAQAAgABAACAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAAgABAACAAGAAEAAIAAQAAgAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgAAQAAgABgABAACAAEAAIAAQAAgABgABAACAAEAAIAAQAAgABgABAACAAEAAIAAQAAgABgABAACAAEAAIAAQAAgABgABAACAAEAAIAAQAAgABgABAACAAEAAIAAQAAgABIAAjQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAAIAAYAAQAAgABAACAAEAH9UGYaAAKBpAG6CEAB0DWA3BAQAAoB+AZQhIAAQAPQL4DAEBAACAAGAAEAA0CCA0xCwAUAA4BYIbAAQAAgAfBoUbACwAUAA4EvxIAAQAAgAPB0aPBwXbACIn0iCh3sDVZUFBgkbTlwAAAAASUVORK5CYII=';

// Wide-bar map: horizontal edge-lens + gentle multi-cycle ripple (R) and a
// vertical cylindrical lens (G). Unlike the edge-only map, this distorts the
// backdrop across the FULL width of a short, wide navbar — not just the ends.
const NAV =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAACyUlEQVR42u3XQY6jMBAFUBtzkSxyzxw8gSwiWwUFWbDlPVkItaZ7At1fv6o+nq9WSitlDtd487uf+v3Ur+PU7Sn9WkpZw00+y/lNPPHnDOM/+p1pe40fsqUPv3u6lr4Y//10/rDR+JxLv8bz6dd83idfH98Vz/j5+Z3U7dvYncuP39L73L3t/EvP7+Ta731Nf0U1PWlNjxk//Hz0dHN6WLiv+SC5IABwB0YgNAAIAAgA2AFAA4AAgBEINAAIAAgA2AFAA4AAgBEINAAIAAgA2AFAA4AAgBEINAAIAAgA2AFAA4AAgACAHQA0AAgAGIFAA4AAgACAHQA0AAgAGIFAA4AAgACAHQA0AAgAGIFAA4AAgACAHQA0AAIgABiBQAOAAIAAgB0ANAAIABiBQAOAAIAAgB0ANAAIABiBQAOAAIAAgB0ANAAIABiBQAOAAIAAgB0ANAAIAAgA2AFAA4AAgBEINAAIAAgA2AFAA4AAgBEINAAIAAgA2AFAA4AAgBEINAAIAAgA2AHQACAAYAQCDQACAAIAdgDQACAAYAQCDQACAAIAdgDQACAAYAQCDQACAAIAdgDQACAAIABgBwANAAIARiDQACAAIABgBwANAAIARiDQACAAIABgBwANAAIARiDQACAAIABgBwANAAIARiDQACAACIAAYAcADQACAEYg0AAgACAAYAcADQACAEYg0AAgACAAYAcADQACAAIAdgDQACAAYAQCDQACAAIAdgDQACAAYAQCDQACAAIAdgDQACAAYAQCDQACAAIAdgDQACAAYAQCDQACAAIAdgDQACAAYAQCDYAAeAkIANgBQAOAAIARCDQACAAIANgBQAOAAIARCDQACAAIANgBQAOAAIAAgB0ANAAIABiBQAOAAIAAgB0ANAAIABiBQAOAAIAAgB0ANAAIABiBQAOAAIAAgB0ANAAIABiB4L8vgOFWpuVZt74AAAAASUVORK5CYII=';

interface StageProps {
  scaleMain: number;
  scaleEdge: number;
  mapA?: string;
}

function TwoStage({ scaleMain, scaleEdge, mapA = MAIN }: StageProps) {
  return (
    <>
      <feImage href={mapA} preserveAspectRatio="none" result="mapA" />
      <feDisplacementMap in="SourceGraphic" in2="mapA" scale={scaleMain} xChannelSelector="R" yChannelSelector="G" result="bend" />
      <feImage href={EDGE} preserveAspectRatio="none" result="mapB" />
      <feDisplacementMap in="bend" in2="mapB" scale={scaleEdge} xChannelSelector="R" yChannelSelector="G" />
    </>
  );
}

export function GlassFilters() {
  return (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        <filter id="lgCard" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <TwoStage scaleMain={30} scaleEdge={14} />
        </filter>
        <filter id="lgStrong" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <TwoStage scaleMain={24} scaleEdge={12} />
        </filter>
        <filter id="lgPill" x="-30%" y="-60%" width="160%" height="220%" colorInterpolationFilters="sRGB">
          <TwoStage scaleMain={32} scaleEdge={15} />
        </filter>
        <filter id="lgCircle" x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <TwoStage scaleMain={38} scaleEdge={18} />
        </filter>
        {/* Wide navbar: rippling + vertical-lens map distorts across the full bar. */}
        <filter id="lgNav" x="-15%" y="-45%" width="130%" height="190%" colorInterpolationFilters="sRGB">
          <TwoStage mapA={NAV} scaleMain={34} scaleEdge={10} />
        </filter>
      </defs>
    </svg>
  );
}
