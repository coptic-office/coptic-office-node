const timeAgo = (date, lang='en') => {

    const MINUTE_IN_SECONDS = 60;
    const HOUR_IN_SECONDS = 3.6e+3;
    const DAY_IN_SECONDS = 8.64e+4;
    const WEEK_IN_SECONDS = 6.048e+5;
    const MONTH_IN_SECONDS = 2.592e+6;
    const QUARTER_IN_SECONDS = 7.776e+6;
    const YEAR_IN_SECONDS = 3.1536e+7;

    const rtf = new Intl.RelativeTimeFormat(lang, {
        localeMatcher: 'best fit', // values: "best fit" or "lookup"
        numeric: 'always', // values: "always" or "auto"
        style: 'long', // values: "long" or "short" or "narrow"
    });

    const timeDiff = (date.getTime() - new Date().getTime()) / 1000;
    const timeDiffAbs = Math.abs(timeDiff);

    if (timeDiffAbs < HOUR_IN_SECONDS) {
        return rtf.format(Math.trunc(timeDiff / MINUTE_IN_SECONDS), 'minute');
    }
    else if (timeDiffAbs < DAY_IN_SECONDS) {
        return rtf.format(Math.trunc(timeDiff / HOUR_IN_SECONDS), 'hour');
    }
    else if (timeDiffAbs < MONTH_IN_SECONDS) {
        return rtf.format(Math.trunc(timeDiff / DAY_IN_SECONDS), 'day');
    }
    else if (timeDiffAbs < QUARTER_IN_SECONDS) {
        return rtf.format(Math.trunc(timeDiff / WEEK_IN_SECONDS), 'week');
    }
    else if (timeDiffAbs < YEAR_IN_SECONDS) {
        return rtf.format(Math.trunc(timeDiff / MONTH_IN_SECONDS), 'month');
    }
    else {
        return rtf.format(Math.trunc(timeDiff / YEAR_IN_SECONDS), 'year');
    }
}

module.exports = {timeAgo};