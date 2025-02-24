$MD_DIR = ".\listmetadata"
$SOQL_DIR = ".\queries"
$MAX_QUERY_LENGTH = 10000
$baseQuery = "SELECT MetadataComponentId,RefMetadataComponentId FROM MetadataComponentDependency WHERE "

Get-ChildItem $MD_DIR | ForEach-Object {
    $Filename = Split-Path -Path $_ -LeafBase
    $xmlContent = Get-Content $_.FullName
    [xml]$xml = $xmlContent
    
    $queries = @()
    $whereClauses = @()
    $separator = " OR "
    $xml.Envelope.Body.listMetadataResponse.result | ForEach-Object {
        $id = $_.id
        $condition = "MetadataComponentId='$id' OR RefMetadataComponentId='$id'"

        if (($baseQuery.Length + $($whereClauses -join "$separator").Length) -le $MAX_QUERY_LENGTH) {
            $whereClauses += "$condition"
        } else {
            $queries += $baseQuery + $($whereClauses -join "$separator")
            
            $whereClauses = @()
            $whereClauses += "$condition"
        }
    }

    $queries += $baseQuery + $($whereClauses -join "$separator")

    # Export each query to a separate file
    for ($i = 0; $i -lt $queries.Count; $i++) {
        $queries[$i] | Out-File -FilePath "$SOQL_DIR\$($Filename)_$i.soql"
    }
}

$Counter = 0
# execute query files and store data
Get-ChildItem $SOQL_DIR | ForEach-Object {
    if ($_.Extension -ne '.soql') { return }

    $CURR_FILENAME = Split-Path -Path $_ -LeafBase
    $OUT_FILE = Join-Path $SOQL_DIR "$CURR_FILENAME.csv"

    if (Test-Path $OUT_FILE) { return }

    sf data query `
        --use-tooling-api `
        --file $_.FullName `
        --result-format 'csv' `
        --output-file $OUT_FILE
}

$GRAPH = @{
    nodes = @()
    edges = @()
}

# BUILD NODES
$uniqueNodes = @{}

Get-ChildItem $MD_DIR | ForEach-Object {
    $xmlContent = Get-Content $_.FullName
    [xml]$xml = $xmlContent
    $xml.Envelope.Body.listMetadataResponse.result | ForEach-Object {
        $MD_RESULT = $_
        $node = @{
            createdById = $MD_RESULT.createdById
            createdByName = $MD_RESULT.createdByName
            createdDate = $MD_RESULT.createdDate
            fileName = $MD_RESULT.fileName
            fullName = $MD_RESULT.fullName
            id = ($MD_RESULT.id -ne "" -and $MD_RESULT -ne $null) ? $MD_RESULT.id : $MD_RESULT.fullName
            lastModifiedById = $MD_RESULT.lastModifiedById
            lastModifiedByName = $MD_RESULT.lastModifiedByName
            lastModifiedDate = $MD_RESULT.lastModifiedDate
            manageableState = ($MD_RESULT.manageableState -ne $null) ? $MD_RESULT.manageableState : ""
            namespacePrefix = ($MD_RESULT.namespacePrefix -ne $null) ? $MD_RESULT.namespacePrefix : ""
            type = $MD_RESULT.type
        }

        $uniqueNodes[$node.id] = $true
        $GRAPH.nodes += $node
    }
}

# BUILD EDGES
Get-ChildItem $SOQL_DIR | ForEach-Object {
    if ($_.Extension -ne '.csv') { return }

    $csv = Import-Csv $_.FullName
    foreach ($item in $csv) {

        if (-not $uniqueNodes.ContainsKey($item.MetadataComponentId) -or -not $uniqueNodes.ContainsKey($item.RefMetadataComponentId)) {
            continue
        }

        $GRAPH.edges += @{
            source = $item.MetadataComponentId
            target = $item.RefMetadataComponentId
        }
    }
}

# Remove nodes that are referenced less than a constant as either a source or a target
$LT_CONST = 1
$nodeReferences = @{}

# Count references for each node
foreach ($edge in $GRAPH.edges) {
    if (-not $nodeReferences.ContainsKey($edge.source)) {
        $nodeReferences[$edge.source] = 0
    }
    if (-not $nodeReferences.ContainsKey($edge.target)) {
        $nodeReferences[$edge.target] = 0
    }
    $nodeReferences[$edge.source]++
    $nodeReferences[$edge.target]++
}

# Filter nodes and edges
$GRAPH.nodes = $GRAPH.nodes | Where-Object { $nodeReferences[$_.id] -ge $LT_CONST }
$GRAPH.edges = $GRAPH.edges | Where-Object { 
    $nodeReferences[$_.source] -ge $LT_CONST -or $nodeReferences[$_.target] -ge $LT_CONST 
}

$FINAL_GRAPH_JSON_PATH = Join-Path 'data' 'tgraph.json'
$GRAPH | ConvertTo-Json -Depth 10 | Out-File $FINAL_GRAPH_JSON_PATH