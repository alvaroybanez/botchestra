import vectorbtpro as vbt

h1_data = vbt.BinanceData.fetch(
    "BTCUSDT", 
    start="2020-01-01 UTC", 
    end="2021-01-01 UTC",
    timeframe="1h")

h1_data.to_hdf()