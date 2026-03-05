
import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { HierarchyNode } from '../utils/hierarchy';
import { GraphData, GraphEdge } from '../types';

interface SunburstGraphProps {
    data: HierarchyNode;
    edges: GraphEdge[]; // Raw edges to be bundled
    width: number;
    height: number;
    onNodeClick?: (node: HierarchyNode) => void;
}

// Helper to map radial coordinates
const mapToRadial = (x: number, y: number, radius: number) => {
    const angle = (x - 90) * (Math.PI / 180); // x is angle in degrees? No, d3.partition uses radians usually 0-2PI
    // Actually d3.partition returns x0, x1 in [0, 1] usually or [0, 2PI] depending on usage.
    // We will use user coordinate system [0, 2PI] for x.
    return {
        x: radius * Math.sqrt(y) * Math.cos(angle), // Simple projection?
        // Standard D3 Sunburst: x is angle, y is radius
        // x in [0, 2*PI], y in [0, radius]
    };
};

export const SunburstGraph: React.FC<SunburstGraphProps> = ({ data, edges, width, height, onNodeClick }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [zoomLevel, setZoomLevel] = useState(1);

    // Layout Constants
    const radius = Math.min(width, height) / 2;
    // const color = d3.scaleOrdinal(d3.schemeCategory10);

    useEffect(() => {
        if (!svgRef.current || !data) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove(); // Clear previous render

        const g = svg.append("g")
            .attr("transform", `translate(${width / 2},${height / 2})`);

        // 1. Hierarchy & Partition Layout
        const root = d3.hierarchy<HierarchyNode>(data)
            .sum(d => d.size || 1)
            .sort((a, b) => (b.value || 0) - (a.value || 0));

        const partition = d3.partition<HierarchyNode>()
            .size([2 * Math.PI, radius]); // x=angle, y=radius

        // Apply layout
        const rootWithLayout = partition(root);

        // Arc Generator
        // Cast to HierarchyRectangularNode because partition adds x0, x1, etc.
        const arc = d3.arc<d3.HierarchyRectangularNode<HierarchyNode>>()
            .startAngle(d => d.x0)
            .endAngle(d => d.x1)
            .padAngle(0.005)
            .padRadius(radius / 2)
            .innerRadius(d => d.y0)
            .outerRadius(d => d.y1 - 1);

        // 2. Render Segments (Sunburst)
        const path = g.append("g")
            .selectAll("path")
            .data(rootWithLayout.descendants().filter(d => d.depth)) // Filter out root if needed
            .join("path")
            .attr("fill", d => {
                if (d.data.type === 'symbol') {
                    const impact = d.data.colorValue;
                    if (impact === undefined || impact === null) {
                        // Fallback color for nodes without impact data (using complexity as proxy or neutral)
                        // distinct from "Low Impact" Blue. Let's use a Slate Grey.
                        return "#64748b";
                    }
                    // Impact 1 (Blue) to 10 (Red)
                    return d3.interpolateRdBu(1 - (Math.min(Math.max(impact, 1), 10) / 10));
                }
                while (d.depth > 1 && d.parent) d = d.parent;
                // Color top-level folders differently (darker, professional palette)
                const colors = d3.schemeTableau10;
                return colors[d.data.name.length % 10];
            })
            .attr("fill-opacity", d => {
                return d.data.type === 'symbol' ? 0.9 : 0.6;
            })
            .attr("d", arc as any) // Cast to any to avoid strict d3 typing issues with Arc
            .style("cursor", "pointer")
            .on("click", (event, d) => {
                if (onNodeClick) onNodeClick(d.data);
                event.stopPropagation();
            })
            .append("title")
            .text(d => `${d.data.name}\nSize: ${d.value}\nImpact: ${d.data.colorValue ?? 'N/A'}`);

        // 3. Hierarchical Edge Bundling (HEB) - Only visible on hover or if important?
        // User requested: "Visual Style: Use a low-opacity gradient for bundles. On hover of a function, highlight."
        // For now, render them with low opacity.

        const nodeMap = new Map<string, d3.HierarchyRectangularNode<HierarchyNode>>();
        rootWithLayout.descendants().forEach(d => {
            if (d.data.path) nodeMap.set(d.data.path, d);
        });

        // Generate links
        const links = edges.map(edge => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (source && target) return source.path(target);
            return null;
        }).filter(l => l) as d3.HierarchyRectangularNode<HierarchyNode>[][];

        // Line Generator
        const line = d3.lineRadial<d3.HierarchyRectangularNode<HierarchyNode>>()
            .curve(d3.curveBundle.beta(0.85))
            .radius(d => d.y0)
            .angle(d => (d.x0 + d.x1) / 2);

        const linkGroup = g.append("g")
            .attr("fill", "none")
            .style("pointer-events", "none"); // Let clicks pass through to arcs

        linkGroup.selectAll("path")
            .data(links)
            .join("path")
            .style("stroke", "#94a3b8")
            .style("stroke-opacity", 0.05) // Very faint by default
            .style("stroke-width", 1)
            .attr("d", line as any);

        // Hover Effect using D3 direct DOM manipulation for performance
        // When hovering a node, highlight its connected edges
        path.on("mouseenter", function (event, d) {
            d3.select(this).attr("fill-opacity", 1);

            // Find edges connected to this node
            // This requires knowing which links call this node.
            // For simplicity, we can just highlight all, or filter.
            // Given the pre-calculated `links` array, matching is O(N).
            // Better: Pre-index edges by node ID?
            // Doing basic filtering for now.

            // Check if HEB path contains this node? d.path(target) returns array of nodes.
            // Highlighting is complex without pre-processing.
            // Simplified: Just highlight ALL edges if bundle count is low, 
            // or implement standard HEB hover.

            // Standard HEB: Highlight paths passing through? Or just source/target?
            // Graph edges are source/target.
            const nodeId = d.data.path;
            if (nodeId) {
                linkGroup.selectAll("path")
                    .style("stroke-opacity", (l: any) => {
                        // l is array of nodes in path.
                        // Check if start or end is this node
                        if (l[0].data.path === nodeId || l[l.length - 1].data.path === nodeId) return 0.8;
                        return 0.01; // Fade others
                    })
                    .style("stroke", (l: any) => {
                        if (l[0].data.path === nodeId || l[l.length - 1].data.path === nodeId) return "#38bdf8"; // Cyan highlight
                        return "#94a3b8";
                    });
            }
        })
            .on("mouseleave", function () {
                d3.select(this).attr("fill-opacity", (d: any) => d.data.type === 'symbol' ? 0.9 : 0.6);

                // Reset edges
                linkGroup.selectAll("path")
                    .style("stroke-opacity", 0.05)
                    .style("stroke", "#94a3b8");
            });

        // 4. Zoom Interactions
        // We can use d3.zoom on the SVG
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 8])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
                setZoomLevel(event.transform.k);
            });

        svg.call(zoom)
            .call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2));

    }, [data, edges, width, height, onNodeClick]);

    return (
        <svg
            ref={svgRef}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{
                width: '100%',
                height: '100%',
                background: '#111827',
                cursor: 'move'
            }}
        />
    );
};
