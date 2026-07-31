"use client";

import { useState } from "react";

interface Point {
  key: string;
  label: string;
  amount: number;
  count: number;
}

const chartWidth = 1120;
const chartHeight = 300;
const chartTop = 24;
const chartBottom = 260;

function coordinatesFor(values: number[]) {
  const maximum = Math.max(...values, 1);
  return values.map((value, index) => ({
    x:
      values.length === 1
        ? chartWidth / 2
        : 24 + (index / (values.length - 1)) * (chartWidth - 48),
    y: chartBottom - (value / maximum) * (chartBottom - chartTop),
  }));
}

function pathFor(points: Array<{ x: number; y: number }>) {
  return points
    .map(
      ({ x, y }, index) =>
        `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`,
    )
    .join(" ");
}

export function OverviewChart({
  points,
  currency,
}: {
  points: Point[];
  currency: string;
}) {
  const [mode, setMode] = useState<"revenue" | "purchases">("revenue");
  const values = points.map((point) =>
    mode === "revenue" ? point.amount : point.count,
  );
  const coordinates = coordinatesFor(values);
  const linePath = pathFor(coordinates);
  const areaPath = coordinates.length
    ? `${linePath} L ${coordinates.at(-1)?.x ?? 0} ${chartBottom} L ${coordinates[0]?.x ?? 0} ${chartBottom} Z`
    : "";
  const total = values.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(...values, 0);
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  });
  return (
    <section className="admin-panel" aria-labelledby="overview-trend-title">
      <header>
        <div>
          <p className="eyebrow">Paid activity</p>
          <h2 id="overview-trend-title">
            {mode === "revenue"
              ? "Gross paid revenue over time"
              : "Successful purchases over time"}
          </h2>
        </div>
        <div
          className="admin-chart-toggle"
          role="group"
          aria-label="Chart metric"
        >
          <button
            aria-pressed={mode === "revenue"}
            onClick={() => setMode("revenue")}
            type="button"
          >
            Revenue
          </button>
          <button
            aria-pressed={mode === "purchases"}
            onClick={() => setMode("purchases")}
            type="button"
          >
            Purchases
          </button>
        </div>
      </header>
      {points.length ? (
        <>
          <p className="sr-only" aria-live="polite">
            Showing {mode === "revenue" ? "gross paid revenue" : "purchases"}{" "}
            across {points.length} time buckets.
          </p>
          <div className="admin-chart-summary" aria-hidden="true">
            <span>
              <small>Period total</small>
              <strong>
                {mode === "revenue"
                  ? money.format(total / 100)
                  : total.toLocaleString("en-US")}
              </strong>
            </span>
            <span>
              <small>Peak bucket</small>
              <strong>
                {mode === "revenue"
                  ? money.format(peak / 100)
                  : peak.toLocaleString("en-US")}
              </strong>
            </span>
          </div>
          <div className="admin-chart-stage">
            <svg
              aria-labelledby="overview-chart-title overview-chart-description"
              className="admin-overview-chart"
              role="img"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            >
              <title id="overview-chart-title">
                {mode === "revenue" ? "Revenue trend" : "Purchase trend"}
              </title>
              <desc id="overview-chart-description">
                A line chart. Exact values are available in the table below.
              </desc>
              <defs>
                <linearGradient
                  id="admin-chart-area"
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="currentColor"
                    stopOpacity="0.2"
                  />
                  <stop
                    offset="100%"
                    stopColor="currentColor"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3].map((line) => {
                const y = chartTop + (line / 3) * (chartBottom - chartTop);
                return (
                  <path
                    d={`M 24 ${y} H ${chartWidth - 24}`}
                    className="admin-chart-grid"
                    key={line}
                  />
                );
              })}
              <path d={areaPath} className="admin-chart-area" />
              <path d={linePath} className="admin-chart-line" />
              {coordinates.map(({ x, y }, index) => {
                const value = values[index] ?? 0;
                return (
                  <circle
                    aria-label={`${points[index]?.label}: ${
                      mode === "revenue"
                        ? money.format(value / 100)
                        : `${value} purchases`
                    }`}
                    className="admin-chart-point"
                    cx={x}
                    cy={y}
                    key={points[index]?.key}
                    r="6"
                    tabIndex={0}
                  />
                );
              })}
              {points.length > 1 ? (
                <>
                  <text className="admin-chart-label" x="24" y="292">
                    {points[0]?.label}
                  </text>
                  <text
                    className="admin-chart-label"
                    textAnchor="end"
                    x={chartWidth - 24}
                    y="292"
                  >
                    {points.at(-1)?.label}
                  </text>
                </>
              ) : null}
            </svg>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption>Accessible trend data</caption>
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Gross revenue</th>
                  <th scope="col">Purchases</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <tr key={point.key}>
                    <td data-label="Period">{point.label}</td>
                    <td data-label="Gross revenue">
                      {money.format(point.amount / 100)}
                    </td>
                    <td data-label="Purchases">{point.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="admin-chart-empty" role="status">
          <svg aria-hidden="true" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
            {[0, 1, 2, 3].map((line) => {
              const y = chartTop + (line / 3) * (chartBottom - chartTop);
              return (
                <path
                  d={`M 24 ${y} H ${chartWidth - 24}`}
                  className="admin-chart-grid"
                  key={line}
                />
              );
            })}
            <path
              className="admin-chart-empty__baseline"
              d={`M 24 ${chartBottom} H ${chartWidth - 24}`}
            />
          </svg>
          <div className="admin-chart-empty__message">
            <strong>No paid activity in this range</strong>
            <span>
              The chart will populate as successful purchases are recorded.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
