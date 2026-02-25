"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const SeasonPassProvider_1 = require("../providers/SeasonPassProvider");
(async () => {
    const res = await (0, SeasonPassProvider_1.fetchScheduleViaESPN)({
        leagueId: 'nba',
        teamId: 'mia',
        teamName: 'Miami Heat',
        teamAbbreviation: 'MIA',
    });
    console.log('ESPN RESULT length', res.games.length, 'error', res.error);
    console.log(res.games.slice(0, 5));
})();

// additional test for fetchScheduleWithMasterTimeout via backend proxy
(async () => {
    console.log('\n--- backend fetch test ---');
    const res = await (0, SeasonPassProvider_1.fetchScheduleWithMasterTimeout)({
        leagueId: 'nhl',
        teamId: 'edm',
        teamName: 'Edmonton Oilers',
        teamAbbreviation: 'EDM',
    });
    console.log('BACKEND RESULT exists?', !!res, 'games length', res?.games?.length, 'error', res?.error);
})();
