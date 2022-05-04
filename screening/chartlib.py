import os 
import pandas as pd

def is_consolidating(df, percentage=2):
    recent_candlesticks = df[-15:]

    max_close = recent_candlesticks['Close'].max()
    min_close = recent_candlesticks['Close'].min()

    threshold = 1 - (percentage / 100)
    if min_close > (max_close * threshold):
        return True

def is_breaking_out(df, percentage=2.5):
    last_close = df[-1:]['Close'].values[0]
    
    if is_consolidating(df[:-1], percentage=percentage):
        recent_closes = df[-16:-1]

        if last_close > recent_closes['Close'].max():
            return True
        
    return False

for filename in os.listdir('datasets/daily'):
    df = pd.read_csv(f'datasets/daily/{filename}')

    if is_consolidating(df, percentage=2):
        print(f'{filename} is consolidating')

    if is_breaking_out(df):
        print(f'{filename} is breaking out')