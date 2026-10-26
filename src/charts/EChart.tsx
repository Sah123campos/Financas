import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart, RadarChart, FunnelChart, HeatmapChart, GaugeChart, CustomChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, VisualMapComponent, TitleComponent, MarkLineComponent, GraphicComponent, AriaComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import type { ClickInfo } from './buildChart';

echarts.use([BarChart, LineChart, PieChart, ScatterChart, RadarChart, FunnelChart, HeatmapChart, GaugeChart, CustomChart,
  GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, VisualMapComponent, TitleComponent, MarkLineComponent, GraphicComponent, AriaComponent, CanvasRenderer]);

export type ChartInstance = echarts.ECharts;

export function EChart({ option, onClick, ariaLabel, onReady, className = '' }: {
  option: EChartsOption; onClick?: (p: ClickInfo) => void; ariaLabel: string; onReady?: (c: ChartInstance | null) => void; className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ChartInstance | null>(null);
  const legendSel = useRef<Record<string, boolean>>({});
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: 'canvas' });
    chart.current = c;
    onReady?.(c);
    c.on('click', (p) => clickRef.current?.(p as unknown as ClickInfo));
    c.on('legendselectchanged', (p) => { legendSel.current = { ...(p as { selected: Record<string, boolean> }).selected }; });
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); c.dispose(); chart.current = null; onReady?.(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const opt = { ...option, aria: { enabled: true, label: { description: ariaLabel } } } as EChartsOption;
    // preserva séries ocultadas pela legenda entre atualizações
    if (opt.legend && !Array.isArray(opt.legend) && Object.keys(legendSel.current).length) (opt.legend as Record<string, unknown>).selected = legendSel.current;
    c.setOption(opt, { notMerge: true, lazyUpdate: true });
    c.getZr().setCursorStyle?.('default');
  }, [option, ariaLabel]);

  return <div ref={el} className={`w-full h-full min-h-[120px] ${className}`} role="img" aria-label={ariaLabel} />;
}
