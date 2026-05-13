export const vtodo = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//BrainstormTrooper//NONSGML My quicktext//EN
BEGIN:VTODO
DTSTAMP:{{stamp}}
SEQUENCE:0
UID:{{uuid}}@brainstormtrooper.github.io
DUE:{{duedate}}
STATUS:NEEDS-ACTION
SUMMARY:{{summary}}
DESCRIPTION:{{note}}
END:VTODO
END:VCALENDAR
`;

export const vevent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//BrainstormTrooper/quicktext//NONSGML v1.0//EN
BEGIN:VEVENT
UID:{{uuid}}@brainstormtrooper.github.io
DTSTAMP:{{stamp}}
DTSTART:{{startdate}}
DTEND:{{enddate}}
SUMMARY:{{summary}}
DESCRIPTION:{{note}}
END:VEVENT
END:VCALENDAR
`;

export const treated = '//Quick treated:{{stamp}}';
