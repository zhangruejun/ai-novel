Get-ChildItem 'e:\Novel\ai-novel\outlines\vol01' -Filter 'ch03*_细纲.md' | ForEach-Object {
    $c = Get-Content $_.FullName -Raw -Encoding UTF8
    $c = $c -replace '穿越第4天上午', '截杀战斗后上午'
    $c = $c -replace '穿越第4天傍晚', '截杀战斗后傍晚'
    $c = $c -replace '穿越第5天上午', '潜入分舵后上午'
    $c = $c -replace '穿越第5天中午', '潜入分舵后中午'
    $c = $c -replace '穿越第5天下午', '潜入分舵后下午'
    $c = $c -replace '穿越第5天傍晚', '潜入分舵后傍晚'
    $c = $c -replace '穿越第5天', '潜入分舵后当天'
    Set-Content $_.FullName -Value $c -Encoding UTF8 -NoNewline
    Write-Host "Updated: $($_.Name)"
}
