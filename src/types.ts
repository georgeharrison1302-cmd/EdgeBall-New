export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      bets_master: {
        Row: {
          bet_data: Json | null
          bet_id: number
          name: string | null
          updated_at: string | null
        }
        Insert: {
          bet_data?: Json | null
          bet_id: number
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          bet_data?: Json | null
          bet_id?: number
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bookmakers: {
        Row: {
          bookmaker_data: Json | null
          bookmaker_id: number
          name: string | null
          updated_at: string | null
        }
        Insert: {
          bookmaker_data?: Json | null
          bookmaker_id: number
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          bookmaker_data?: Json | null
          bookmaker_id?: number
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      countries: {
        Row: {
          code: string | null
          flag: string | null
          name: string
        }
        Insert: {
          code?: string | null
          flag?: string | null
          name: string
        }
        Update: {
          code?: string | null
          flag?: string | null
          name?: string
        }
        Relationships: []
      }
      custom_predictions: {
        Row: {
          advice: string | null
          fixture_id: number
          inputs: Json | null
          percent_away: number
          percent_draw: number
          percent_home: number
          updated_at: string | null
          xg_away: number
          xg_home: number
        }
        Insert: {
          advice?: string | null
          fixture_id: number
          inputs?: Json | null
          percent_away: number
          percent_draw: number
          percent_home: number
          updated_at?: string | null
          xg_away: number
          xg_home: number
        }
        Update: {
          advice?: string | null
          fixture_id?: number
          inputs?: Json | null
          percent_away?: number
          percent_draw?: number
          percent_home?: number
          updated_at?: string | null
          xg_away?: number
          xg_home?: number
        }
        Relationships: []
      }
      fixture_events: {
        Row: {
          assist_id: number | null
          assist_name: string | null
          comments: string | null
          detail: string | null
          event_data: Json | null
          fixture_id: number
          id: number
          player_id: number | null
          player_name: string | null
          team_id: number | null
          time_elapsed: number | null
          time_extra: number | null
          type: string | null
        }
        Insert: {
          assist_id?: number | null
          assist_name?: string | null
          comments?: string | null
          detail?: string | null
          event_data?: Json | null
          fixture_id: number
          id?: number
          player_id?: number | null
          player_name?: string | null
          team_id?: number | null
          time_elapsed?: number | null
          time_extra?: number | null
          type?: string | null
        }
        Update: {
          assist_id?: number | null
          assist_name?: string | null
          comments?: string | null
          detail?: string | null
          event_data?: Json | null
          fixture_id?: number
          id?: number
          player_id?: number | null
          player_name?: string | null
          team_id?: number | null
          time_elapsed?: number | null
          time_extra?: number | null
          type?: string | null
        }
        Relationships: []
      }
      fixture_injuries: {
        Row: {
          fixture_id: number
          player_id: number
          player_name: string | null
          player_photo: string | null
          reason: string | null
          team_id: number | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          fixture_id: number
          player_id: number
          player_name?: string | null
          player_photo?: string | null
          reason?: string | null
          team_id?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          fixture_id?: number
          player_id?: number
          player_name?: string | null
          player_photo?: string | null
          reason?: string | null
          team_id?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      fixture_lineups: {
        Row: {
          coach: Json | null
          fixture_id: number
          formation: string | null
          start_xi: Json | null
          substitutes: Json | null
          team_id: number
          updated_at: string | null
        }
        Insert: {
          coach?: Json | null
          fixture_id: number
          formation?: string | null
          start_xi?: Json | null
          substitutes?: Json | null
          team_id: number
          updated_at?: string | null
        }
        Update: {
          coach?: Json | null
          fixture_id?: number
          formation?: string | null
          start_xi?: Json | null
          substitutes?: Json | null
          team_id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      fixture_player_statistics: {
        Row: {
          fixture_id: number
          player_id: number
          player_name: string | null
          statistics: Json | null
          team_id: number
          updated_at: string | null
        }
        Insert: {
          fixture_id: number
          player_id: number
          player_name?: string | null
          statistics?: Json | null
          team_id: number
          updated_at?: string | null
        }
        Update: {
          fixture_id?: number
          player_id?: number
          player_name?: string | null
          statistics?: Json | null
          team_id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      fixture_statistics: {
        Row: {
          fixture_id: number
          statistics: Json | null
          team_id: number
          updated_at: string | null
        }
        Insert: {
          fixture_id: number
          statistics?: Json | null
          team_id: number
          updated_at?: string | null
        }
        Update: {
          fixture_id?: number
          statistics?: Json | null
          team_id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      fixtures: {
        Row: {
          away_goals: number | null
          away_team_id: number | null
          date: string | null
          elapsed: number | null
          home_goals: number | null
          home_team_id: number | null
          id: number
          league_id: number | null
          referee: string | null
          score: Json | null
          season: number | null
          status_long: string | null
          status_short: string | null
          timestamp: number | null
          timezone: string | null
          venue_id: number | null
        }
        Insert: {
          away_goals?: number | null
          away_team_id?: number | null
          date?: string | null
          elapsed?: number | null
          home_goals?: number | null
          home_team_id?: number | null
          id: number
          league_id?: number | null
          referee?: string | null
          score?: Json | null
          season?: number | null
          status_long?: string | null
          status_short?: string | null
          timestamp?: number | null
          timezone?: string | null
          venue_id?: number | null
        }
        Update: {
          away_goals?: number | null
          away_team_id?: number | null
          date?: string | null
          elapsed?: number | null
          home_goals?: number | null
          home_team_id?: number | null
          id?: number
          league_id?: number | null
          referee?: string | null
          score?: Json | null
          season?: number | null
          status_long?: string | null
          status_short?: string | null
          timestamp?: number | null
          timezone?: string | null
          venue_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      fixtures_h2h: {
        Row: {
          fixture_date: string | null
          id: number
          match_data: Json | null
          team1_id: number | null
          team2_id: number | null
        }
        Insert: {
          fixture_date?: string | null
          id: number
          match_data?: Json | null
          team1_id?: number | null
          team2_id?: number | null
        }
        Update: {
          fixture_date?: string | null
          id?: number
          match_data?: Json | null
          team1_id?: number | null
          team2_id?: number | null
        }
        Relationships: []
      }
      ingest_checkpoints: {
        Row: {
          created_at: string
          id: string
          last_run_at: string | null
          last_status: string | null
          params: Json
          resource: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          last_run_at?: string | null
          last_status?: string | null
          params?: Json
          resource: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_run_at?: string | null
          last_status?: string | null
          params?: Json
          resource?: string
          updated_at?: string
        }
        Relationships: []
      }
      league_seasons: {
        Row: {
          coverage: Json | null
          current: boolean
          end: string | null
          league_id: number
          start: string | null
          year: number
        }
        Insert: {
          coverage?: Json | null
          current?: boolean
          end?: string | null
          league_id: number
          start?: string | null
          year: number
        }
        Update: {
          coverage?: Json | null
          current?: boolean
          end?: string | null
          league_id?: number
          start?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_seasons_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          country_code: string | null
          country_flag: string | null
          country_name: string | null
          id: number
          logo: string | null
          name: string
          type: string | null
        }
        Insert: {
          country_code?: string | null
          country_flag?: string | null
          country_name?: string | null
          id: number
          logo?: string | null
          name: string
          type?: string | null
        }
        Update: {
          country_code?: string | null
          country_flag?: string | null
          country_name?: string | null
          id?: number
          logo?: string | null
          name?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leagues_country_name_fkey"
            columns: ["country_name"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["name"]
          },
        ]
      }
      live_bets_master: {
        Row: {
          bet_data: Json | null
          bet_id: number
          name: string | null
          updated_at: string | null
        }
        Insert: {
          bet_data?: Json | null
          bet_id: number
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          bet_data?: Json | null
          bet_id?: number
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      live_odds: {
        Row: {
          bookmaker_id: number
          bookmaker_name: string | null
          fixture_id: number
          league_id: number | null
          odds_data: Json | null
          status: Json | null
          updated_at: string | null
        }
        Insert: {
          bookmaker_id: number
          bookmaker_name?: string | null
          fixture_id: number
          league_id?: number | null
          odds_data?: Json | null
          status?: Json | null
          updated_at?: string | null
        }
        Update: {
          bookmaker_id?: number
          bookmaker_name?: string | null
          fixture_id?: number
          league_id?: number | null
          odds_data?: Json | null
          status?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      match_injuries: {
        Row: {
          created_at: string | null
          fixture_id: number
          id: number
          player_id: number
          reason: string | null
          team_id: number
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          fixture_id: number
          id?: number
          player_id: number
          reason?: string | null
          team_id: number
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          fixture_id?: number
          id?: number
          player_id?: number
          reason?: string | null
          team_id?: number
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_injuries_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_injuries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      odds: {
        Row: {
          fixture_id: number
          markets: Json | null
          update_time: string | null
        }
        Insert: {
          fixture_id: number
          markets?: Json | null
          update_time?: string | null
        }
        Update: {
          fixture_id?: number
          markets?: Json | null
          update_time?: string | null
        }
        Relationships: []
      }
      odds_mapping: {
        Row: {
          fixture_date: string | null
          fixture_id: number
          fixture_timestamp: number | null
          league_id: number | null
          mapping_data: Json | null
          season: number | null
          update_time: string | null
          updated_at: string | null
        }
        Insert: {
          fixture_date?: string | null
          fixture_id: number
          fixture_timestamp?: number | null
          league_id?: number | null
          mapping_data?: Json | null
          season?: number | null
          update_time?: string | null
          updated_at?: string | null
        }
        Update: {
          fixture_date?: string | null
          fixture_id?: number
          fixture_timestamp?: number | null
          league_id?: number | null
          mapping_data?: Json | null
          season?: number | null
          update_time?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      player_profiles: {
        Row: {
          age: number | null
          birth_date: string | null
          firstname: string | null
          height: string | null
          lastname: string | null
          name: string | null
          nationality: string | null
          photo: string | null
          player_data: Json | null
          player_id: number
          updated_at: string | null
          weight: string | null
        }
        Insert: {
          age?: number | null
          birth_date?: string | null
          firstname?: string | null
          height?: string | null
          lastname?: string | null
          name?: string | null
          nationality?: string | null
          photo?: string | null
          player_data?: Json | null
          player_id: number
          updated_at?: string | null
          weight?: string | null
        }
        Update: {
          age?: number | null
          birth_date?: string | null
          firstname?: string | null
          height?: string | null
          lastname?: string | null
          name?: string | null
          nationality?: string | null
          photo?: string | null
          player_data?: Json | null
          player_id?: number
          updated_at?: string | null
          weight?: string | null
        }
        Relationships: []
      }
      player_season_stats: {
        Row: {
          appearances: number | null
          assists: number | null
          goals: number | null
          league_id: number
          minutes: number | null
          player_id: number
          rating: number | null
          red_cards: number | null
          season: number
          stats_data: Json | null
          team_id: number
          updated_at: string | null
          yellow_cards: number | null
        }
        Insert: {
          appearances?: number | null
          assists?: number | null
          goals?: number | null
          league_id: number
          minutes?: number | null
          player_id: number
          rating?: number | null
          red_cards?: number | null
          season: number
          stats_data?: Json | null
          team_id: number
          updated_at?: string | null
          yellow_cards?: number | null
        }
        Update: {
          appearances?: number | null
          assists?: number | null
          goals?: number | null
          league_id?: number
          minutes?: number | null
          player_id?: number
          rating?: number | null
          red_cards?: number | null
          season?: number
          stats_data?: Json | null
          team_id?: number
          updated_at?: string | null
          yellow_cards?: number | null
        }
        Relationships: []
      }
      player_season_years: {
        Row: {
          year: number
        }
        Insert: {
          year: number
        }
        Update: {
          year?: number
        }
        Relationships: []
      }
      player_sidelined: {
        Row: {
          end_date: string | null
          player_id: number
          sidelined_data: Json | null
          start_date: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          end_date?: string | null
          player_id: number
          sidelined_data?: Json | null
          start_date?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          end_date?: string | null
          player_id?: number
          sidelined_data?: Json | null
          start_date?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      player_teams_history: {
        Row: {
          player_id: number
          seasons: number[] | null
          team_id: number
          team_logo: string | null
          team_name: string | null
          teams_data: Json | null
          updated_at: string | null
        }
        Insert: {
          player_id: number
          seasons?: number[] | null
          team_id: number
          team_logo?: string | null
          team_name?: string | null
          teams_data?: Json | null
          updated_at?: string | null
        }
        Update: {
          player_id?: number
          seasons?: number[] | null
          team_id?: number
          team_logo?: string | null
          team_name?: string | null
          teams_data?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      player_transfers: {
        Row: {
          player_id: number
          team_in_id: number | null
          team_in_name: string | null
          team_out_id: number | null
          team_out_name: string | null
          transfer_data: Json | null
          transfer_date: string
          transfer_type: string | null
          updated_at: string | null
        }
        Insert: {
          player_id: number
          team_in_id?: number | null
          team_in_name?: string | null
          team_out_id?: number | null
          team_out_name?: string | null
          transfer_data?: Json | null
          transfer_date: string
          transfer_type?: string | null
          updated_at?: string | null
        }
        Update: {
          player_id?: number
          team_in_id?: number | null
          team_in_name?: string | null
          team_out_id?: number | null
          team_out_name?: string | null
          transfer_data?: Json | null
          transfer_date?: string
          transfer_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      player_trophies: {
        Row: {
          country: string | null
          league: string
          place: string | null
          player_id: number
          season: string | null
          trophy_data: Json | null
          updated_at: string | null
        }
        Insert: {
          country?: string | null
          league: string
          place?: string | null
          player_id: number
          season?: string | null
          trophy_data?: Json | null
          updated_at?: string | null
        }
        Update: {
          country?: string | null
          league?: string
          place?: string | null
          player_id?: number
          season?: string | null
          trophy_data?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      players: {
        Row: {
          age: number | null
          id: number
          name: string | null
          number: number | null
          photo: string | null
          position: string | null
        }
        Insert: {
          age?: number | null
          id: number
          name?: string | null
          number?: number | null
          photo?: string | null
          position?: string | null
        }
        Update: {
          age?: number | null
          id?: number
          name?: string | null
          number?: number | null
          photo?: string | null
          position?: string | null
        }
        Relationships: []
      }
      predictions: {
        Row: {
          advice: string | null
          comparison: Json | null
          fixture_id: number
          goals: Json | null
          h2h: Json | null
          percent: Json | null
          prediction_data: Json | null
          teams: Json | null
          under_over: string | null
          updated_at: string | null
          win_or_draw: boolean | null
          winner: Json | null
        }
        Insert: {
          advice?: string | null
          comparison?: Json | null
          fixture_id: number
          goals?: Json | null
          h2h?: Json | null
          percent?: Json | null
          prediction_data?: Json | null
          teams?: Json | null
          under_over?: string | null
          updated_at?: string | null
          win_or_draw?: boolean | null
          winner?: Json | null
        }
        Update: {
          advice?: string | null
          comparison?: Json | null
          fixture_id?: number
          goals?: Json | null
          h2h?: Json | null
          percent?: Json | null
          prediction_data?: Json | null
          teams?: Json | null
          under_over?: string | null
          updated_at?: string | null
          win_or_draw?: boolean | null
          winner?: Json | null
        }
        Relationships: []
      }
      prematch_odds: {
        Row: {
          bookmaker_id: number
          bookmaker_name: string | null
          edge_pct: number | null
          fixture_id: number
          league_id: number | null
          model_prob: number | null
          odds_data: Json | null
          season: number | null
          updated_at: string | null
        }
        Insert: {
          bookmaker_id: number
          bookmaker_name?: string | null
          edge_pct?: number | null
          fixture_id: number
          league_id?: number | null
          model_prob?: number | null
          odds_data?: Json | null
          season?: number | null
          updated_at?: string | null
        }
        Update: {
          bookmaker_id?: number
          bookmaker_name?: string | null
          edge_pct?: number | null
          fixture_id?: number
          league_id?: number | null
          model_prob?: number | null
          odds_data?: Json | null
          season?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      seasons: {
        Row: {
          year: number
        }
        Insert: {
          year: number
        }
        Update: {
          year?: number
        }
        Relationships: []
      }
      standings: {
        Row: {
          all_stats: Json | null
          away_stats: Json | null
          description: string | null
          form: string | null
          goals_diff: number | null
          group_name: string | null
          home_stats: Json | null
          league_id: number
          points: number | null
          rank: number | null
          season: number
          status: string | null
          team_id: number
          updated_at: string | null
        }
        Insert: {
          all_stats?: Json | null
          away_stats?: Json | null
          description?: string | null
          form?: string | null
          goals_diff?: number | null
          group_name?: string | null
          home_stats?: Json | null
          league_id: number
          points?: number | null
          rank?: number | null
          season: number
          status?: string | null
          team_id: number
          updated_at?: string | null
        }
        Update: {
          all_stats?: Json | null
          away_stats?: Json | null
          description?: string | null
          form?: string | null
          goals_diff?: number | null
          group_name?: string | null
          home_stats?: Json | null
          league_id?: number
          points?: number | null
          rank?: number | null
          season?: number
          status?: string | null
          team_id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      team_coaches: {
        Row: {
          age: number | null
          career: Json | null
          coach_data: Json | null
          coach_id: number
          firstname: string | null
          lastname: string | null
          name: string | null
          nationality: string | null
          photo: string | null
          team_id: number
          updated_at: string | null
        }
        Insert: {
          age?: number | null
          career?: Json | null
          coach_data?: Json | null
          coach_id: number
          firstname?: string | null
          lastname?: string | null
          name?: string | null
          nationality?: string | null
          photo?: string | null
          team_id: number
          updated_at?: string | null
        }
        Update: {
          age?: number | null
          career?: Json | null
          coach_data?: Json | null
          coach_id?: number
          firstname?: string | null
          lastname?: string | null
          name?: string | null
          nationality?: string | null
          photo?: string | null
          team_id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      team_seasons: {
        Row: {
          league_id: number
          season: number
          team_id: number
        }
        Insert: {
          league_id: number
          season: number
          team_id: number
        }
        Update: {
          league_id?: number
          season?: number
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_seasons_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_seasons_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_squads: {
        Row: {
          age: number | null
          number: number | null
          photo: string | null
          player_id: number
          player_name: string | null
          position: string | null
          team_id: number
          updated_at: string | null
        }
        Insert: {
          age?: number | null
          number?: number | null
          photo?: string | null
          player_id: number
          player_name?: string | null
          position?: string | null
          team_id: number
          updated_at?: string | null
        }
        Update: {
          age?: number | null
          number?: number | null
          photo?: string | null
          player_id?: number
          player_name?: string | null
          position?: string | null
          team_id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      team_statistics: {
        Row: {
          league_id: number
          season: number
          stats: Json | null
          team_id: number
          update_time: string | null
        }
        Insert: {
          league_id: number
          season: number
          stats?: Json | null
          team_id: number
          update_time?: string | null
        }
        Update: {
          league_id?: number
          season?: number
          stats?: Json | null
          team_id?: number
          update_time?: string | null
        }
        Relationships: []
      }
      teams: {
        Row: {
          code: string | null
          country: string | null
          founded: number | null
          id: number
          logo: string | null
          name: string
          national: boolean | null
          venue_id: number | null
        }
        Insert: {
          code?: string | null
          country?: string | null
          founded?: number | null
          id: number
          logo?: string | null
          name: string
          national?: boolean | null
          venue_id?: number | null
        }
        Update: {
          code?: string | null
          country?: string | null
          founded?: number | null
          id?: number
          logo?: string | null
          name?: string
          national?: boolean | null
          venue_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      timezones: {
        Row: {
          name: string
        }
        Insert: {
          name: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      top_assists: {
        Row: {
          appearences: number | null
          assists: number | null
          goals: number | null
          league_id: number
          minutes: number | null
          photo: string | null
          player_id: number
          player_name: string | null
          rank: number
          season: number
          team_id: number | null
          team_name: string | null
        }
        Insert: {
          appearences?: number | null
          assists?: number | null
          goals?: number | null
          league_id: number
          minutes?: number | null
          photo?: string | null
          player_id: number
          player_name?: string | null
          rank: number
          season: number
          team_id?: number | null
          team_name?: string | null
        }
        Update: {
          appearences?: number | null
          assists?: number | null
          goals?: number | null
          league_id?: number
          minutes?: number | null
          photo?: string | null
          player_id?: number
          player_name?: string | null
          rank?: number
          season?: number
          team_id?: number | null
          team_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "top_assists_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      top_red_cards: {
        Row: {
          appearences: number | null
          league_id: number
          minutes: number | null
          photo: string | null
          player_id: number
          player_name: string | null
          rank: number
          red: number | null
          season: number
          team_id: number | null
          team_name: string | null
          yellow: number | null
          yellowred: number | null
        }
        Insert: {
          appearences?: number | null
          league_id: number
          minutes?: number | null
          photo?: string | null
          player_id: number
          player_name?: string | null
          rank: number
          red?: number | null
          season: number
          team_id?: number | null
          team_name?: string | null
          yellow?: number | null
          yellowred?: number | null
        }
        Update: {
          appearences?: number | null
          league_id?: number
          minutes?: number | null
          photo?: string | null
          player_id?: number
          player_name?: string | null
          rank?: number
          red?: number | null
          season?: number
          team_id?: number | null
          team_name?: string | null
          yellow?: number | null
          yellowred?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "top_red_cards_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      top_scorers: {
        Row: {
          appearences: number | null
          assists: number | null
          goals: number | null
          league_id: number
          minutes: number | null
          photo: string | null
          player_id: number
          player_name: string | null
          rank: number
          season: number
          team_id: number | null
          team_name: string | null
        }
        Insert: {
          appearences?: number | null
          assists?: number | null
          goals?: number | null
          league_id: number
          minutes?: number | null
          photo?: string | null
          player_id: number
          player_name?: string | null
          rank: number
          season: number
          team_id?: number | null
          team_name?: string | null
        }
        Update: {
          appearences?: number | null
          assists?: number | null
          goals?: number | null
          league_id?: number
          minutes?: number | null
          photo?: string | null
          player_id?: number
          player_name?: string | null
          rank?: number
          season?: number
          team_id?: number | null
          team_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "top_scorers_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      top_yellow_cards: {
        Row: {
          appearences: number | null
          league_id: number
          minutes: number | null
          photo: string | null
          player_id: number
          player_name: string | null
          rank: number
          red: number | null
          season: number
          team_id: number | null
          team_name: string | null
          yellow: number | null
          yellowred: number | null
        }
        Insert: {
          appearences?: number | null
          league_id: number
          minutes?: number | null
          photo?: string | null
          player_id: number
          player_name?: string | null
          rank: number
          red?: number | null
          season: number
          team_id?: number | null
          team_name?: string | null
          yellow?: number | null
          yellowred?: number | null
        }
        Update: {
          appearences?: number | null
          league_id?: number
          minutes?: number | null
          photo?: string | null
          player_id?: number
          player_name?: string | null
          rank?: number
          red?: number | null
          season?: number
          team_id?: number | null
          team_name?: string | null
          yellow?: number | null
          yellowred?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "top_yellow_cards_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_bets: {
        Row: {
          combined_odds: number
          created_at: string
          currency: string
          id: string
          legs: Json
          notes: string | null
          potential_return: number
          profit: number | null
          settled_at: string | null
          stake: number
          status: string
          user_id: string
        }
        Insert: {
          combined_odds: number
          created_at?: string
          currency?: string
          id?: string
          legs?: Json
          notes?: string | null
          potential_return: number
          profit?: number | null
          settled_at?: string | null
          stake: number
          status?: string
          user_id: string
        }
        Update: {
          combined_odds?: number
          created_at?: string
          currency?: string
          id?: string
          legs?: Json
          notes?: string | null
          potential_return?: number
          profit?: number | null
          settled_at?: string | null
          stake?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          user_id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: "active" | "inactive" | "past_due"
          price_id: string | null
          current_period_end: string | null
          updated_at: string
          created_at: string
        }
        Insert: {
          user_id: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: "active" | "inactive" | "past_due"
          price_id?: string | null
          current_period_end?: string | null
          updated_at?: string
          created_at?: string
        }
        Update: {
          user_id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: "active" | "inactive" | "past_due"
          price_id?: string | null
          current_period_end?: string | null
          updated_at?: string
          created_at?: string
        }
        Relationships: []
      }
      venues: {
        Row: {
          address: string | null
          capacity: number | null
          city: string | null
          country: string | null
          id: number
          image: string | null
          name: string | null
          surface: string | null
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          country?: string | null
          id: number
          image?: string | null
          name?: string | null
          surface?: string | null
        }
        Update: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          country?: string | null
          id?: number
          image?: string | null
          name?: string | null
          surface?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      team_match_sheet_totals: {
        Row: {
          away_corners_per_game: number | null
          away_xc_per_game: number | null
          away_xg_per_game: number | null
          corners_per_game: number | null
          home_corners_per_game: number | null
          home_xc_per_game: number | null
          home_xg_per_game: number | null
          league_id: number | null
          season: number | null
          team_id: number | null
          xc_per_game: number | null
          xg_per_game: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
