let selectedNodes = new Set();
let groupBy = "createdByName"

d3.json("data/tgraph.json").then(graphData => {
    // Count nodes in each group
    const groupCounts = d3.rollup(
        graphData.nodes,
        v => v.length, // Count nodes in each group
        d => d[groupBy] // Group by the selected attribute
    );

    // Sort groups by size (ascending order: least → most)
    const nodetypes = [...groupCounts.keys()]
        .sort((a, b) => groupCounts.get(a) - groupCounts.get(b));

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10) // Uses 10 preset colors
        .domain(nodetypes); // Assigns each nodetype a unique color

    const width = window.innerWidth;
    const height = window.innerHeight;
    const svg = d3.select("svg")
        .call(d3.zoom().on("zoom", (event) => {
            let newTransform = event.transform;
            g.attr("transform", newTransform);
        }));

    const g = svg.append("g");

    const simulation = d3.forceSimulation(graphData.nodes)
        .force("link", d3.forceLink(graphData.edges).id(d => d.id))
        .force("charge", d3.forceManyBody().strength(-1000))
        .force("radial", d3.forceRadial(300, width / 2, height / 2)); // Centralized circular layout
        // .force("radial", d3.forceRadial(300, width / 2, height / 2))


    const link = g.append("g")
        .selectAll("line")
        .data(graphData.edges)
        .join("line")
        .attr("class", "link")
        .attr("stroke", "#999")
        .attr("stroke-opacity", 0.6)
        .attr("stroke-width", 2);

    const node = g.append("g")
        .selectAll("circle")
        .data(graphData.nodes)
        .join("circle")
        .attr("r", 10)
        .attr("class", "node")
        .attr("stroke-width", "0px")
        .attr("stroke", d => colorScale(d[groupBy]))
        .attr("fill", d => colorScale(d[groupBy]));

    // Create a legend
    const legend = d3.select(".panel")
        .append("ul")
        .attr("class", "legend");

    const legendItems = legend.selectAll(".legend-item")
        .data(nodetypes)
        .enter()
        .append("li")
        .attr("class", "legend-item")
        .each(function (grouping) {
            const legendItem = d3.select(this);

            legendItem.append("svg")
                .attr("width", 20)
                .attr("height", 20)
                .append("circle")
                .attr("r", 10)
                .attr("cx", 10)
                .attr("cy", 10)
                .attr("fill", colorScale(grouping));

            legendItem.append("span")
                .attr("class", "legend-label")
                .text(grouping);

            legendItem.on("mouseenter", () => {
                legendItem.classed("state--snowflake", true);
            });

            legendItem.on("mouseleave", () => {
                legendItem.classed("state--snowflake", false);
            });

            // Add an empty <ul> for selected nodes under each grouping
            legendItem.append("ul")
                .attr("class", "selected-nodes");
        });

    node.append("title").text(d => d.fullName);

    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);
    });

    // Selection box
    let selectionBox = svg.append("rect")
        .attr("fill", "rgba(0,0,255,0.1)") // Light blue transparent box
        .attr("stroke", "blue")
        .attr("stroke-dasharray", "4")
        .style("visibility", "hidden");

    // Variables to store mouse positions
    let startX, startY;

    // Start dragging
    svg.on("mousedown", (event) => {
        const [x, y] = d3.pointer(event);
        startX = x;
        startY = y;

        selectionBox
            .attr("x", x)
            .attr("y", y)
            .attr("width", 0)
            .attr("height", 0)
            .style("visibility", "visible");
    });

    // Update selection box while dragging
    svg.on("mousemove", (event) => {
        if (startX === undefined) return;

        const [x, y] = d3.pointer(event);
        selectionBox
            .attr("x", Math.min(startX, x))
            .attr("y", Math.min(startY, y))
            .attr("width", Math.abs(x - startX))
            .attr("height", Math.abs(y - startY));
    });

    svg.on("mouseup", (event) => {
        if (startX === undefined) return;

        const [endX, endY] = d3.pointer(event);
        const transform = d3.zoomTransform(svg.node()); // Get current zoom/pan transform

        // Convert selection box coordinates based on transform
        const x1 = (Math.min(startX, endX) - transform.x) / transform.k;
        const y1 = (Math.min(startY, endY) - transform.y) / transform.k;
        const x2 = (Math.max(startX, endX) - transform.x) / transform.k;
        const y2 = (Math.max(startY, endY) - transform.y) / transform.k;

        // Add new nodes to the selection
        const newNodes = new Set();
        graphData.nodes.forEach(d => {
            const x = d.x;
            const y = d.y;
            if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
                newNodes.add(d);
            }
        });

        setSelectedNodes(newNodes);

        // Reset selection box
        selectionBox.style("visibility", "hidden");
        startX = undefined;
    });

    function setSelectedNodes(newSelection) {
        selectedNodes = newSelection;
        updateUI();
    }

    function updateUI() {
        updateLegend();
        updateGraph();
    }

    function updateLegend() {
        // Convert Set to an array for sorting
        const selectedArray = Array.from(selectedNodes);

        // Sort A-Z
        selectedArray.sort((a, b) => a.fullName.localeCompare(b.fullName));
        
        // Group selected nodes by grouping
        const nodesByType = d3.group(selectedArray, d => d[groupBy]);
        console.log('nodesByType', nodesByType)

        // Remove old selected nodes lists
        d3.selectAll(".selected-nodes").remove();

        // Append selected nodes under the correct grouping, outside of the legend item
        d3.selectAll(".legend-item").each(function (grouping) {
            const selectedForType = nodesByType.get(grouping) || [];

            if (selectedForType.length > 0) {
                // Insert <ul> AFTER the legend item instead of inside it
                d3.select(this).node().insertAdjacentHTML("afterend", `
                <ul class="selected-nodes">
                    ${selectedForType.map(node => `<li>${node.fullName}</li>`).join('')}
                </ul>
            `);
            }
        });
    }

    function updateGraph() {
        d3.select("svg.graph")
            .classed("hasSelections", selectedNodes.size > 0);

        // Apply CSS class to selected nodes
        node.classed("selected", d => selectedNodes.has(d));

        // Apply CSS class to links where either node is selected
        link.classed("selected", d => selectedNodes.has(d.source) || selectedNodes.has(d.target));
    }


    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
});
